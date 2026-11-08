import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { User } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';

/**
 * Роль строки `users` для учёток клиентов. Внешнего ключа на `roles` нет,
 * таблица ролей пуста; все существующие пользователи имеют role_id=1
 * (то же значение — в marketplace-client.repository заявки онбординга).
 */
const CLIENT_USER_ROLE_ID = BigInt(1);

export interface CreateCabinetUserInput {
    email: string;
    firstName: string;
    lastName: string;
    clientId: bigint | null;
    bitrixUserId?: string;
}

/** Нормализация email: так он хранится и так ищется. */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

/**
 * Учётные записи кабинета (`users`, общая таблица с заявкой онбординга и
 * легаси-кабинетом). Пароль кабинет пишет только хэшем bcrypt.
 */
@Injectable()
export class CabinetUserRepository {
    constructor(private readonly prisma: PrismaService) {}

    findById(id: bigint): Promise<User | null> {
        return this.prisma.user.findUnique({ where: { id } });
    }

    findByEmail(email: string): Promise<User | null> {
        return this.prisma.user.findFirst({
            where: { email: normalizeEmail(email) },
        });
    }

    /**
     * Новая учётка без пароля: вход появится после установки пароля по
     * ссылке из письма (или из админки). Заглушка — заведомо не bcrypt-хэш.
     */
    create(input: CreateCabinetUserInput): Promise<User> {
        return this.prisma.user.create({
            data: {
                email: normalizeEmail(input.email),
                name: input.firstName.trim(),
                surname: input.lastName.trim(),
                client_id: input.clientId,
                role_id: CLIENT_USER_ROLE_ID,
                ...(input.bitrixUserId
                    ? { bitrix_id: input.bitrixUserId }
                    : {}),
                password: unusablePassword(),
                email_verified_at: null,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    }

    setClient(userId: bigint, clientId: bigint): Promise<User> {
        return this.prisma.user.update({
            where: { id: userId },
            data: { client_id: clientId, updated_at: new Date() },
        });
    }

    /**
     * Новый пароль. Ссылка пришла на почту и открыта — значит почта
     * подтверждена: `email_verified_at` ставится здесь же.
     */
    setPasswordHash(userId: bigint, hash: string): Promise<User> {
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                password: hash,
                email_verified_at: new Date(),
                updated_at: new Date(),
            },
        });
    }
}

function unusablePassword(): string {
    return `!unusable!${randomBytes(24).toString('hex')}`;
}
