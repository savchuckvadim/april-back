import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import {
    CABINET_TOKEN_NAMES,
    CABINET_TOKENABLE_TYPE,
} from '../domain/cabinet.constants';

export type CabinetTokenName =
    (typeof CABINET_TOKEN_NAMES)[keyof typeof CABINET_TOKEN_NAMES];

/** Случайный токен для ссылки/refresh: 48 байт → 96 hex-символов. */
export function generateOpaqueToken(): string {
    return randomBytes(48).toString('hex');
}

/** В БД лежит только sha256 токена — утечка таблицы не даёт войти. */
export function hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Одноразовые и долгоживущие токены кабинета в `personal_access_tokens`:
 * refresh входа с сайта и ссылки установки/сброса пароля. Хранится
 * только хэш; просроченная строка удаляется при первом обращении.
 */
@Injectable()
export class CabinetTokenRepository {
    constructor(private readonly prisma: PrismaService) {}

    async save(
        userId: bigint,
        name: CabinetTokenName,
        token: string,
        expiresAt: Date,
    ): Promise<void> {
        const now = new Date();
        await this.prisma.personal_access_tokens.create({
            data: {
                tokenable_type: CABINET_TOKENABLE_TYPE,
                tokenable_id: userId,
                name,
                token: hashOpaqueToken(token),
                expires_at: expiresAt,
                created_at: now,
                updated_at: now,
            },
        });
    }

    /** Владелец действующего токена (без удаления); null — нет или истёк. */
    async findUserId(
        token: string,
        name: CabinetTokenName,
    ): Promise<bigint | null> {
        const row = await this.prisma.personal_access_tokens.findFirst({
            where: {
                token: hashOpaqueToken(token),
                tokenable_type: CABINET_TOKENABLE_TYPE,
                name,
            },
        });
        if (!row) return null;
        if (row.expires_at && row.expires_at.getTime() <= Date.now()) {
            await this.prisma.personal_access_tokens.deleteMany({
                where: { id: row.id },
            });
            return null;
        }
        return row.tokenable_id;
    }

    /** Погасить токен: вернуть владельца и удалить строку (одноразовость). */
    async consume(
        token: string,
        name: CabinetTokenName,
    ): Promise<bigint | null> {
        const userId = await this.findUserId(token, name);
        if (userId === null) return null;
        const { count } = await this.prisma.personal_access_tokens.deleteMany({
            where: {
                token: hashOpaqueToken(token),
                tokenable_type: CABINET_TOKENABLE_TYPE,
                name,
            },
        });
        // Параллельный запрос уже погасил тот же токен — второй не проходит.
        return count > 0 ? userId : null;
    }

    async revokeAll(userId: bigint, name: CabinetTokenName): Promise<void> {
        await this.prisma.personal_access_tokens.deleteMany({
            where: {
                tokenable_type: CABINET_TOKENABLE_TYPE,
                tokenable_id: userId,
                name,
            },
        });
    }
}
