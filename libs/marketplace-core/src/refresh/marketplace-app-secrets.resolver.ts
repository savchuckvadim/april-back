import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    localAppSecretCodeByDomain,
    localAppSecretCodeByMemberId,
    SHARED_APP_SECRET_CODE,
} from '../domain/app-secret-code.util';
import {
    MarketplaceTokenError,
    MarketplaceTokenErrorCode,
} from '../domain/marketplace-token.errors';
import {
    MarketplaceAppSecrets,
    MarketplaceAuthRepository,
} from '../persistence/marketplace-auth.repository';

/**
 * Включить общую пару тиражного приложения (Маркет) и env-фолбэк
 * MARKETPLACE_CLIENT_ID/SECRET. В April Маркета нет (решение владельца
 * 08.11.2026) — по умолчанию выключено: локальное приложение без своих
 * ключей получает понятную ошибку «ключи не внесены», а не чужую пару и
 * wrong_client через час. Код Маркета оставлен образцом — включается
 * `MARKETPLACE_SHARED_APP_ENABLED=true`.
 */
export const MARKETPLACE_SHARED_APP_ENV = 'MARKETPLACE_SHARED_APP_ENABLED';

/** Кэш найденных OAuth-кред (bitrix_app_secrets) в памяти процесса */
const APP_SECRETS_CACHE_TTL_MS = 60 * 1000;
/**
 * Кэш ОТСУТСТВИЯ кред — заметно короче: клиент вносит свои client_id/secret
 * и тут же ставит приложение, минутный «мисс» выглядел бы как поломка.
 */
const APP_SECRETS_MISS_CACHE_TTL_MS = 10 * 1000;
/** Предел кэша кред: по записи на портал, чистится при переполнении */
const APP_SECRETS_CACHE_MAX_ENTRIES = 500;

/**
 * Идентичность портала для адресации ЕГО OAuth-кред.
 * У локальных приложений креды свои на каждом портале.
 */
export interface PortalSecretIdentity {
    memberId?: string | null;
    domain?: string | null;
}

export interface ResolvedAppSecrets {
    secrets: MarketplaceAppSecrets;
    /** Код найденной строки (`garant_local:mid:…`, `env`) — для журнала, не секрет. */
    code: string;
}

/**
 * OAuth-креды ДЛЯ КОНКРЕТНОГО ПОРТАЛА. Порядок:
 *  1. локальное приложение по member_id — постоянный ключ;
 *  2. локальное приложение по домену — так их заводят до установки
 *     (member_id тогда ещё неизвестен);
 *  3–4. только при MARKETPLACE_SHARED_APP_ENABLED=true: общая пара
 *     тиражного приложения, затем env MARKETPLACE_CLIENT_ID/SECRET.
 *
 * Кэш — по КОДУ строки: общий кэш отдал бы порталу B креды портала A.
 */
@Injectable()
export class MarketplaceAppSecretsResolver {
    private readonly cache = new Map<
        string,
        { value: MarketplaceAppSecrets | null; expiresAt: number }
    >();

    constructor(
        private readonly repository: MarketplaceAuthRepository,
        private readonly configService: ConfigService,
    ) {}

    /** @throws MarketplaceTokenError APP_KEYS_MISSING / OAUTH_UNAVAILABLE */
    async resolve(identity: PortalSecretIdentity): Promise<ResolvedAppSecrets> {
        const local = localCodes(identity);
        const shared = this.sharedEnabled();
        const candidates = shared ? [...local, SHARED_APP_SECRET_CODE] : local;

        for (const code of candidates) {
            const secrets = await this.findCached(code);
            if (secrets) return { secrets, code };
        }

        if (shared) {
            const fromEnv = this.fromEnv();
            if (fromEnv) return { secrets: fromEnv, code: 'env' };
            throw new MarketplaceTokenError(
                MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE,
                'OAuth-креды приложения не найдены: в bitrix_app_secrets нет строк с code ' +
                    `${candidates.join(' / ')} и не заданы MARKETPLACE_CLIENT_ID/SECRET`,
            );
        }
        throw new MarketplaceTokenError(
            MarketplaceTokenErrorCode.APP_KEYS_MISSING,
            `Ключи локального приложения портала не внесены (${local.join(' / ') || 'нет домена и member_id'})`,
        );
    }

    /** Ключи портала только что сменили — следующий рефреш читает БД, а не кэш. */
    forget(identity: PortalSecretIdentity): void {
        for (const code of localCodes(identity)) {
            this.cache.delete(code);
        }
    }

    private sharedEnabled(): boolean {
        return (
            (this.configService.get<string>(MARKETPLACE_SHARED_APP_ENV) ?? '')
                .trim()
                .toLowerCase() === 'true'
        );
    }

    private async findCached(
        code: string,
    ): Promise<MarketplaceAppSecrets | null> {
        const cached = this.cache.get(code);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value;
        }
        const value = await this.repository.findAppSecrets(code);
        this.prune();
        this.cache.set(code, {
            value,
            expiresAt:
                Date.now() +
                (value
                    ? APP_SECRETS_CACHE_TTL_MS
                    : APP_SECRETS_MISS_CACHE_TTL_MS),
        });
        return value;
    }

    /** Кэш растёт по числу порталов — чистим протухшее при переполнении. */
    private prune(): void {
        if (this.cache.size < APP_SECRETS_CACHE_MAX_ENTRIES) return;
        const now = Date.now();
        for (const [code, entry] of this.cache) {
            if (entry.expiresAt <= now) this.cache.delete(code);
        }
        if (this.cache.size >= APP_SECRETS_CACHE_MAX_ENTRIES) {
            this.cache.clear();
        }
    }

    private fromEnv(): MarketplaceAppSecrets | null {
        const clientId = this.configService.get<string>(
            'MARKETPLACE_CLIENT_ID',
        );
        const clientSecret = this.configService.get<string>(
            'MARKETPLACE_CLIENT_SECRET',
        );
        return clientId && clientSecret ? { clientId, clientSecret } : null;
    }
}

/** Коды строк локального приложения портала: по member_id, затем по домену. */
function localCodes(identity: PortalSecretIdentity): string[] {
    return [
        identity.memberId
            ? localAppSecretCodeByMemberId(identity.memberId)
            : null,
        identity.domain ? localAppSecretCodeByDomain(identity.domain) : null,
    ].filter((code): code is string => code !== null);
}
