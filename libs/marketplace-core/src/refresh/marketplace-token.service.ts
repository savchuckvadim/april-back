import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { RedisService } from '@/core/redis/redis.service';
import {
    ActiveInstall,
    FindActiveInstallQuery,
    MarketplaceAuthRepository,
} from '../persistence/marketplace-auth.repository';
import {
    MarketplaceTokenError,
    MarketplaceTokenErrorCode,
} from '../domain/marketplace-token.errors';
import { MarketplaceAppSecretsResolver } from './marketplace-app-secrets.resolver';

/**
 * Валидный access_token установки (локальное приложение или Маркет) с
 * автоматическим refresh через oauth.bitrix24.tech. Нужен всем операциям,
 * происходящим ПОЗЖЕ установки: access живёт 1 час, refresh — 28 дней (и
 * обновляется при каждом открытии приложения пользователем — /app
 * перезаписывает токены). Чьими ключами обновлять — решает
 * MarketplaceAppSecretsResolver (свои ключи портала).
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

const DEFAULT_OAUTH_URL = 'https://oauth.bitrix24.tech/oauth/token/';

@Injectable()
export class MarketplaceTokenService {
    private readonly logger = new Logger(MarketplaceTokenService.name);

    constructor(
        private readonly repository: MarketplaceAuthRepository,
        private readonly redisService: RedisService,
        private readonly http: HttpService,
        private readonly configService: ConfigService,
        private readonly secrets: MarketplaceAppSecretsResolver,
    ) {}

    /**
     * Валидный access_token: свежий — из БД, протухающий — через refresh.
     * Ошибки — типизированные MarketplaceTokenError (см. коды).
     */
    async getFreshAccessToken(query: FindActiveInstallQuery): Promise<string> {
        const install = await this.findInstallOrThrow(query);
        if (this.isFresh(install.expires_at)) {
            const { accessToken } = this.repository.getDecryptedTokens(install);
            if (accessToken) {
                return accessToken;
            }
        }
        return this.refreshWithLock(install);
    }

    /**
     * Обновить токен сейчас, даже если он свежий, — проверка ключей
     * приложения («ключи подходят?») сразу после их внесения.
     * @throws MarketplaceTokenError (APP_KEYS_MISSING, APP_KEYS_INVALID, …)
     */
    async forceRefresh(query: FindActiveInstallQuery): Promise<void> {
        await this.refreshWithLock(await this.findInstallOrThrow(query));
    }

    /**
     * Есть ли активная установка по домену (детект для PBXService.init).
     * Кэш в Redis — init зовётся десятки раз за прогон.
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

    private async findInstallOrThrow(
        query: FindActiveInstallQuery,
    ): Promise<ActiveInstall> {
        const install = await this.repository.findActiveInstall(query);
        if (!install) {
            throw new MarketplaceTokenError(
                MarketplaceTokenErrorCode.NO_INSTALL,
                `Активная установка приложения не найдена (${query.memberId ?? query.domain ?? '-'})`,
            );
        }
        return install;
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

        // Креды берутся ПО ПОРТАЛУ установки: у локальных приложений они
        // свои на каждом портале (member_id приоритетнее домена — домен
        // могли переименовать уже после внесения кред клиентом).
        const { secrets, code: secretsCode } = await this.secrets.resolve({
            memberId: install.portals.member_id,
            domain: install.portals.domain,
        });
        const oauthUrl =
            this.configService.get<string>('MARKETPLACE_OAUTH_URL') ??
            DEFAULT_OAUTH_URL;

        let data: BitrixOAuthTokenResponse;
        try {
            const response = await firstValueFrom(
                this.http.get<BitrixOAuthTokenResponse>(oauthUrl, {
                    params: {
                        grant_type: 'refresh_token',
                        client_id: secrets.clientId,
                        client_secret: secrets.clientSecret,
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

        const { access_token, refresh_token, expires_in } = data;
        if (!access_token || !refresh_token || !expires_in) {
            return this.failRefresh(install, data, secretsCode);
        }

        await this.repository.saveRefreshedTokens(install.id, {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: new Date(Date.now() + expires_in * 1000),
        });
        await this.repository.logTokenEvent({
            memberId: install.portals.member_id ?? undefined,
            domain: install.portals.domain ?? undefined,
            status: 'processed',
        });
        this.logger.log(
            `Token refreshed: install=${install.id} domain=${install.portals.domain ?? '-'} secrets=${secretsCode}`,
        );
        return access_token;
    }

    /** Журнал + типизированная ошибка: чужие ключи ≠ протухший refresh ≠ сеть. */
    private async failRefresh(
        install: ActiveInstall,
        data: BitrixOAuthTokenResponse,
        secretsCode: string,
    ): Promise<never> {
        const detail = data.error
            ? `${data.error}: ${data.error_description ?? ''}`
            : 'пустой ответ OAuth';
        await this.repository.logTokenEvent({
            memberId: install.portals.member_id ?? undefined,
            domain: install.portals.domain ?? undefined,
            status: 'error',
            errorDetail: `${detail} (креды: ${secretsCode})`,
        });
        this.logger.warn(
            `Token refresh failed: install=${install.id} secrets=${secretsCode} ${detail}`,
        );
        if (data.error === 'wrong_client') {
            throw new MarketplaceTokenError(
                MarketplaceTokenErrorCode.APP_KEYS_INVALID,
                'Битрикс отверг ключи приложения: client_id/client_secret не от приложения, установленного на портале',
            );
        }
        if (data.error === 'invalid_grant') {
            throw new MarketplaceTokenError(
                MarketplaceTokenErrorCode.REFRESH_INVALID,
                'refresh_token недействителен (портал не открывал приложение >28 дней) — попросите клиента открыть приложение',
            );
        }
        throw new MarketplaceTokenError(
            MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE,
            `OAuth-сервер Битрикса недоступен: ${detail}`,
        );
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
