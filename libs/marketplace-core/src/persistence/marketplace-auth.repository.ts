import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core';
import { decrypt, encrypt } from '@/shared/lib/utils/crypt.util';
import { marketplace_installs, Portal } from 'generated/prisma';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';

/**
 * Доступ к учёткам маркетплейс-установок (marketplace_installs) для
 * токен-сервиса. Общий код apps/pbx и apps/pbx-install — поэтому живёт
 * в либе, а не в модуле marketplace.
 *
 * Легаси-таблицы bitrix_apps/bitrix_tokens здесь НЕ используются —
 * это отдельный мир libs/bitrix-auth.
 */

export interface FindActiveInstallQuery {
    memberId?: string;
    domain?: string;
    /** Код приложения; по умолчанию — «Менеджер Гарант» */
    appCode?: string;
}

export interface DecryptedTokens {
    accessToken: string | null;
    refreshToken: string | null;
}

export interface RefreshedTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
}

/** OAuth-креды приложения из bitrix_app_secrets */
export interface MarketplaceAppSecrets {
    clientId: string;
    clientSecret: string;
}

export type ActiveInstall = marketplace_installs & { portals: Portal };

@Injectable()
export class MarketplaceAuthRepository {
    private readonly logger = new Logger(MarketplaceAuthRepository.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Активная установка (uninstalled_at IS NULL) с порталом.
     * member_id приоритетен (постоянный идентификатор), domain — фолбэк.
     */
    async findActiveInstall(
        query: FindActiveInstallQuery,
    ): Promise<ActiveInstall | null> {
        const appCode = query.appCode ?? (BITRIX_APP_CODES.GARANT as string);
        const portalWhere = query.memberId
            ? { member_id: query.memberId }
            : query.domain
              ? { domain: query.domain }
              : null;
        if (!portalWhere) {
            return null;
        }
        return this.prisma.marketplace_installs.findFirst({
            where: {
                app_code: appCode,
                uninstalled_at: null,
                portals: portalWhere,
            },
            include: { portals: true },
        });
    }

    /** Расшифрованные токены установки (crypt.util, общий APP_KEY) */
    getDecryptedTokens(install: marketplace_installs): DecryptedTokens {
        return {
            accessToken: this.tryDecrypt(install.access_token, 'access_token'),
            refreshToken: this.tryDecrypt(
                install.refresh_token,
                'refresh_token',
            ),
        };
    }

    /** Сохранить обновлённую пару токенов (шифрованно) */
    async saveRefreshedTokens(
        installId: string,
        tokens: RefreshedTokens,
    ): Promise<void> {
        await this.prisma.marketplace_installs.update({
            where: { id: installId },
            data: {
                access_token: encrypt(tokens.accessToken),
                refresh_token: encrypt(tokens.refreshToken),
                expires_at: tokens.expiresAt,
                updated_at: new Date(),
            },
        });
    }

    /** Свежая запись установки (poll конкурентного refresh) */
    async findInstallById(
        installId: string,
    ): Promise<marketplace_installs | null> {
        return this.prisma.marketplace_installs.findUnique({
            where: { id: installId },
        });
    }

    /**
     * OAuth-креды приложения из bitrix_app_secrets по code
     * (источник истины; env MARKETPLACE_CLIENT_ID/SECRET — фолбэк).
     * client_secret хранится шифрованным (crypt.util/APP_KEY — админка
     * шифрует при записи); строки, записанные до шифрования, читаются
     * как открытый текст (обратная совместимость).
     */
    async findAppSecrets(code: string): Promise<MarketplaceAppSecrets | null> {
        const row = await this.prisma.bitrix_app_secrets.findFirst({
            where: { code },
        });
        if (!row?.client_id || !row.client_secret) {
            return null;
        }
        let clientSecret: string;
        try {
            clientSecret = decrypt(row.client_secret);
        } catch {
            clientSecret = row.client_secret; // legacy-строка открытым текстом
        }
        return { clientId: row.client_id, clientSecret };
    }

    /** Журнал bitrix_app_events (best-effort, не роняет основной флоу) */
    async logTokenEvent(input: {
        memberId?: string;
        domain?: string;
        status: 'processed' | 'error';
        errorDetail?: string;
    }): Promise<void> {
        try {
            await this.prisma.bitrix_app_events.create({
                data: {
                    id: randomUUID(),
                    member_id: input.memberId,
                    domain: input.domain,
                    event: 'TOKEN_REFRESH',
                    status: input.status,
                    error_detail: input.errorDetail,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        } catch (error) {
            this.logger.warn(
                `logTokenEvent failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private tryDecrypt(value: string | null, label: string): string | null {
        if (!value) {
            return null;
        }
        try {
            return decrypt(value);
        } catch {
            this.logger.warn(`${label} decrypt failed`);
            return null;
        }
    }
}
