import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core';
import { encrypt } from '@/shared/lib/utils/crypt.util';

/** Что видно о внесённых ключах — без секрета. */
export interface LocalAppKeysMeta {
    code: string;
    clientId: string;
    updatedAt: Date | null;
}

/** Последнее обновление токена портала (журнал bitrix_app_events). */
export interface LocalAppTokenEvent {
    at: Date | null;
    ok: boolean;
    error: string | null;
}

const TOKEN_REFRESH_EVENT = 'TOKEN_REFRESH';
const LOCAL_APP_SECRET_GROUP = 'local_app';

/**
 * Ключи локального приложения портала в bitrix_app_secrets
 * (`garant_local:<домен>`, `garant_local:mid:<member_id>`). Секрет —
 * шифрованно (тот же crypt.util, что у админки «Секреты приложений»).
 */
@Injectable()
export class LocalAppKeysRepository {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Записать одну и ту же пару под все коды портала: и по домену, и по
     * member_id. Иначе старая строка по member_id (её ищут первой)
     * перекрыла бы новые ключи.
     */
    async saveKeys(
        codes: readonly string[],
        clientId: string,
        clientSecret: string,
    ): Promise<void> {
        const secret = encrypt(clientSecret);
        const now = new Date();
        await this.prisma.$transaction(async tx => {
            for (const code of codes) {
                const existing = await tx.bitrix_app_secrets.findFirst({
                    where: { code },
                    select: { id: true },
                });
                if (existing) {
                    await tx.bitrix_app_secrets.update({
                        where: { id: existing.id },
                        data: {
                            client_id: clientId,
                            client_secret: secret,
                            updated_at: now,
                        },
                    });
                } else {
                    await tx.bitrix_app_secrets.create({
                        data: {
                            code,
                            group: LOCAL_APP_SECRET_GROUP,
                            client_id: clientId,
                            client_secret: secret,
                            created_at: now,
                            updated_at: now,
                        },
                    });
                }
            }
        });
    }

    /** Первая найденная строка в порядке кодов (member_id, затем домен). */
    async findKeysMeta(
        codes: readonly string[],
    ): Promise<LocalAppKeysMeta | null> {
        const rows = await this.prisma.bitrix_app_secrets.findMany({
            where: { code: { in: [...codes] } },
            select: { code: true, client_id: true, updated_at: true },
        });
        for (const code of codes) {
            const row = rows.find(item => item.code === code);
            if (row?.client_id) {
                return {
                    code,
                    clientId: row.client_id,
                    updatedAt: row.updated_at,
                };
            }
        }
        return null;
    }

    async lastTokenEvent(identity: {
        memberId: string | null;
        domain: string | null;
    }): Promise<LocalAppTokenEvent | null> {
        const or = [
            identity.memberId ? { member_id: identity.memberId } : null,
            identity.domain ? { domain: identity.domain } : null,
        ].filter(
            (item): item is { member_id: string } | { domain: string } =>
                item !== null,
        );
        if (!or.length) return null;
        const row = await this.prisma.bitrix_app_events.findFirst({
            where: { event: TOKEN_REFRESH_EVENT, OR: or },
            orderBy: { created_at: 'desc' },
            select: { created_at: true, status: true, error_detail: true },
        });
        return row
            ? {
                  at: row.created_at,
                  ok: row.status !== 'error',
                  error: row.error_detail,
              }
            : null;
    }
}
