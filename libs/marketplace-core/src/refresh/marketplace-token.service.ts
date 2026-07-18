import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '@/core/redis/redis.service';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import {
    ActiveInstall,
    FindActiveInstallQuery,
    MarketplaceAppSecrets,
    MarketplaceAuthRepository,
} from '../persistence/marketplace-auth.repository';
import {
    MarketplaceTokenError,
    MarketplaceTokenErrorCode,
} from '../domain/marketplace-token.errors';

/**
 * Валидный access_token маркетплейс-установки с автоматическим refresh
 * через oauth.bitrix24.tech. Нужен всем операциям, происходящим ПОЗЖЕ
 * установки (approve → provisioning, admin refresh привязок): access
 * живёт 1 час, refresh — 28 дней (и обновляется при каждом открытии
 * приложения пользователем — /app перезаписывает токены).
 *
 * Конкурентные refresh гасятся Redis-локом: первый поток обновляет,
 * остальные ждут появления свежего expires_at в БД (poll).
 */

interface BitrixOAuthTokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
}

/** Обновляем, если жить осталось меньше 5 минут */
const TOKEN_MIN_TTL_MS = 5 * 60 * 1000;
/** TTL лока refresh (защита от зависшего потока) */
const LOCK_TTL_MS = 30 * 1000;
/** Ожидание чужого refresh: шаг и максимум */
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 10 * 1000;
/** Кэш «есть активная установка» (для PBXService.init на каждый вызов) */
const HAS_INSTALL_CACHE_TTL_S = 60;
/** Кэш OAuth-кред приложения (bitrix_app_secrets) в памяти процесса */
const APP_SECRETS_CACHE_TTL_MS = 60 * 1000;

const DEFAULT_OAUTH_URL = 'https://oauth.bitrix24.tech/oauth/token/';

@Injectable()
export class MarketplaceTokenService {
    private readonly logger = new Logger(MarketplaceTokenService.name);

    /** Кэш кред приложения: {значение, до какого момента валиден} */
    private appSecretsCache?: {
        value: MarketplaceAppSecrets;
        expiresAt: number;
    };

    constructor(
        private readonly repository: MarketplaceAuthRepository,
        private readonly redisService: RedisService,
        private readonly http: HttpService,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Валидный access_token: свежий — из БД, протухающий — через refresh.
     * Ошибки — типизированные MarketplaceTokenError (см. коды).
     */
    async getFreshAccessToken(query: FindActiveInstallQuery): Promise<string> {
        const install = await this.repository.findActiveInstall(query);
        if (!install) {
            throw new MarketplaceTokenError(
                MarketplaceTokenErrorCode.NO_INSTALL,
                `Активная маркетплейс-установка не найдена (${query.memberId ?? query.domain ?? '-'})`,
            );
        }

        if (this.isFresh(install.expires_at)) {
            const { accessToken } = this.repository.getDecryptedTokens(install);
            if (accessToken) {
                return accessToken;
            }
        }
        return this.refreshWithLock(install);
    }

    /**
     * Есть ли активная маркетплейс-установка по домену (детект для
     * PBXService.init). Кэш в Redis — init зовётся десятки раз за прогон.
     */
    async hasActiveInstall(domain: string): Promise<boolean> {
        const cacheKey = `mp:install:active:${domain}`;
        const redis = this.redisService.getClient();
        try {
            const cached = await redis.get(cacheKey);
            if (cached !== null) {
                return cached === '1';
            }
        } catch {
            // Redis недоступен — идём в БД
        }
        const install = await this.repository.findActiveInstall({ domain });
        const has = install !== null;
        try {
            await redis.set(
                cacheKey,
                has ? '1' : '0',
                'EX',
                HAS_INSTALL_CACHE_TTL_S,
            );
        } catch {
            // кэш — best-effort
        }
        return has;
    }

    private isFresh(expiresAt: Date | null): boolean {
        return (
            expiresAt !== null &&
            expiresAt.getTime() - Date.now() > TOKEN_MIN_TTL_MS
        );
    }

    private async refreshWithLock(install: ActiveInstall): Promise<string> {
        const lockKey = `mp:token:refresh:${install.id}`;
        const redis = this.redisService.getClient();

        let lockAcquired = false;
        try {
            lockAcquired =
                (await redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX')) ===
                'OK';
        } catch {
            // Redis недоступен — рефрешим без лока (риск двойного refresh
            // приемлем: Битрикс отдаёт новую пару обоим, сохранится последняя)
            lockAcquired = true;
        }

        if (!lockAcquired) {
            return this.waitForConcurrentRefresh(install);
        }

        try {
            return await this.refresh(install);
        } finally {
            try {
                await redis.del(lockKey);
            } catch {
                // лок истечёт сам по TTL
            }
        }
    }

    /** Лок занят: ждём, пока конкурентный поток обновит токены в БД */
    private async waitForConcurrentRefresh(
        install: ActiveInstall,
    ): Promise<string> {
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
            const current = await this.repository.findInstallById(install.id);
            if (current && this.isFresh(current.expires_at)) {
                const { accessToken } =
                    this.repository.getDecryptedTokens(current);
                if (accessToken) {
                    return accessToken;
                }
            }
        }
        throw new MarketplaceTokenError(
            MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE,
            `Конкурентный refresh не завершился за ${POLL_TIMEOUT_MS} мс (install=${install.id})`,
        );
    }

    private async refresh(install: ActiveInstall): Promise<string> {
        const { refreshToken } = this.repository.getDecryptedTokens(install);
        if (!refreshToken) {
            throw new MarketplaceTokenError(
                MarketplaceTokenErrorCode.NO_REFRESH_TOKEN,
                `refresh_token отсутствует (install=${install.id})`,
            );
        }

        const { clientId, clientSecret } = await this.resolveAppSecrets();
        const oauthUrl =
            this.configService.get<string>('MARKETPLACE_OAUTH_URL') ??
            DEFAULT_OAUTH_URL;

        let data: BitrixOAuthTokenResponse;
        try {
            const response = await firstValueFrom(
                this.http.get<BitrixOAuthTokenResponse>(oauthUrl, {
                    params: {
                        grant_type: 'refresh_token',
                        client_id: clientId,
                        client_secret: clientSecret,
                        refresh_token: refreshToken,
                    },
                }),
            );
            data = response.data;
        } catch (error) {
            // 4xx от oauth-сервера тоже прилетает сюда (axios throw) —
            // тело с error=invalid_grant достаём из ответа
            data = this.extractErrorBody(error);
        }

        if (!data.access_token || !data.refresh_token || !data.expires_in) {
            const detail = data.error
                ? `${data.error}: ${data.error_description ?? ''}`
                : 'пустой ответ OAuth';
            const invalidGrant =
                data.error === 'invalid_grant' || data.error === 'wrong_client';
            await this.repository.logTokenEvent({
                memberId: install.portals.member_id ?? undefined,
                domain: install.portals.domain ?? undefined,
                status: 'error',
                errorDetail: detail,
            });
            this.logger.warn(
                `Token refresh failed: install=${install.id} ${detail}`,
            );
            throw new MarketplaceTokenError(
                invalidGrant
                    ? MarketplaceTokenErrorCode.REFRESH_INVALID
                    : MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE,
                invalidGrant
                    ? 'refresh_token недействителен (портал не открывал приложение >28 дней) — попросите клиента открыть приложение'
                    : `OAuth-сервер Битрикса недоступен: ${detail}`,
            );
        }

        await this.repository.saveRefreshedTokens(install.id, {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + data.expires_in * 1000),
        });
        await this.repository.logTokenEvent({
            memberId: install.portals.member_id ?? undefined,
            domain: install.portals.domain ?? undefined,
            status: 'processed',
        });
        this.logger.log(
            `Token refreshed: install=${install.id} domain=${install.portals.domain ?? '-'}`,
        );
        return data.access_token;
    }

    /**
     * OAuth-креды приложения: источник истины — bitrix_app_secrets
     * (code = «Менеджер Гарант»; правится админкой без деплоя), фолбэк —
     * env MARKETPLACE_CLIENT_ID/SECRET. Кэш в памяти на минуту.
     */
    private async resolveAppSecrets(): Promise<MarketplaceAppSecrets> {
        if (
            this.appSecretsCache &&
            this.appSecretsCache.expiresAt > Date.now()
        ) {
            return this.appSecretsCache.value;
        }

        const fromDb = await this.repository.findAppSecrets(
            BITRIX_APP_CODES.GARANT as string,
        );
        const value: MarketplaceAppSecrets | null =
            fromDb ?? this.appSecretsFromEnv();
        if (!value) {
            throw new MarketplaceTokenError(
                MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE,
                'OAuth-креды приложения не найдены: нет строки в bitrix_app_secrets (code=garant_manager) и не заданы MARKETPLACE_CLIENT_ID/SECRET',
            );
        }
        this.appSecretsCache = {
            value,
            expiresAt: Date.now() + APP_SECRETS_CACHE_TTL_MS,
        };
        return value;
    }

    private appSecretsFromEnv(): MarketplaceAppSecrets | null {
        const clientId = this.configService.get<string>(
            'MARKETPLACE_CLIENT_ID',
        );
        const clientSecret = this.configService.get<string>(
            'MARKETPLACE_CLIENT_SECRET',
        );
        return clientId && clientSecret ? { clientId, clientSecret } : null;
    }

    private extractErrorBody(error: unknown): BitrixOAuthTokenResponse {
        if (
            typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            typeof (error as { response?: { data?: unknown } }).response
                ?.data === 'object'
        ) {
            return (error as { response: { data: BitrixOAuthTokenResponse } })
                .response.data;
        }
        return {
            error: 'network_error',
            error_description:
                error instanceof Error ? error.message : String(error),
        };
    }
}
