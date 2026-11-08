import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    localAppSecretCodeByDomain,
    localAppSecretCodeByMemberId,
    normalizePortalDomain,
} from '../domain/app-secret-code.util';
import {
    MarketplaceTokenError,
    MarketplaceTokenErrorCode,
} from '../domain/marketplace-token.errors';
import { MarketplaceAuthRepository } from '../persistence/marketplace-auth.repository';
import {
    LocalAppKeysRepository,
    LocalAppTokenEvent,
} from '../persistence/local-app-keys.repository';
import { MarketplaceAppSecretsResolver } from '../refresh/marketplace-app-secrets.resolver';
import { MarketplaceTokenService } from '../refresh/marketplace-token.service';
import {
    LOCAL_APP_API_URL_ENV,
    LOCAL_APP_CLIENT_ID_RE,
    LOCAL_APP_CLIENT_SECRET_RE,
    LOCAL_APP_DEFAULT_API_URL,
    LOCAL_APP_PATHS,
    LOCAL_APP_SCOPES,
    LocalAppCheckResult,
    localAppDevSectionUrl,
} from './local-app.constants';

/** Портал, который подключают (из контекста кабинета или админки). */
export interface LocalAppPortalRef {
    domain: string | null;
    memberId: string | null;
}

export interface LocalAppConnection {
    domain: string;
    /** Что ввести в Битрикс24 при создании локального приложения. */
    setup: {
        devSectionUrl: string;
        handlerUrl: string;
        installUrl: string;
        scopes: string[];
    };
    keys: { set: boolean; clientId: string | null; updatedAt: Date | null };
    install: {
        installed: boolean;
        status: string | null;
        installedAt: Date | null;
        tokenExpiresAt: Date | null;
    };
    lastRefresh: LocalAppTokenEvent | null;
}

export interface LocalAppKeysInput {
    clientId: string;
    clientSecret: string;
}

export interface LocalAppCheck {
    result: LocalAppCheckResult;
    message: string;
}

const CHECK_MESSAGES: Record<LocalAppCheckResult, string> = {
    ok: 'Ключи подходят: Битрикс24 выдал новый токен.',
    no_keys: 'Ключи приложения не внесены.',
    not_installed:
        'Приложение ещё не установлено на портале — ключи проверятся после установки.',
    keys_invalid:
        'Битрикс24 не принял ключи: client_id или client_secret не от этого приложения. Скопируйте их заново из карточки локального приложения.',
    reopen_app:
        'Ключи приняты, но токен устарел: откройте приложение April в Битрикс24 — токен обновится.',
    unavailable: 'Битрикс24 сейчас не ответил — повторите проверку позже.',
};

const CHECK_BY_ERROR: Partial<
    Record<MarketplaceTokenErrorCode, LocalAppCheckResult>
> = {
    [MarketplaceTokenErrorCode.APP_KEYS_MISSING]: 'no_keys',
    [MarketplaceTokenErrorCode.APP_KEYS_INVALID]: 'keys_invalid',
    [MarketplaceTokenErrorCode.NO_INSTALL]: 'not_installed',
    [MarketplaceTokenErrorCode.NO_REFRESH_TOKEN]: 'reopen_app',
    [MarketplaceTokenErrorCode.REFRESH_INVALID]: 'reopen_app',
    [MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE]: 'unavailable',
};

/**
 * «Подключение Битрикс24» локальным приложением: инструкция (адреса,
 * права), ключи клиента и проверка, что они подходят. Общая логика для
 * кабинета клиента (владелец) и админки April.
 */
@Injectable()
export class LocalAppConnectionService {
    private readonly logger = new Logger(LocalAppConnectionService.name);

    constructor(
        private readonly keys: LocalAppKeysRepository,
        private readonly installs: MarketplaceAuthRepository,
        private readonly tokens: MarketplaceTokenService,
        private readonly secrets: MarketplaceAppSecretsResolver,
        private readonly config: ConfigService,
    ) {}

    async status(portal: LocalAppPortalRef): Promise<LocalAppConnection> {
        const domain = this.domainOf(portal);
        const [keys, install, lastRefresh] = await Promise.all([
            this.keys.findKeysMeta(codesOf(portal, domain)),
            this.installs.findActiveInstall(
                portal.memberId ? { memberId: portal.memberId } : { domain },
            ),
            this.keys.lastTokenEvent({ memberId: portal.memberId, domain }),
        ]);
        const apiUrl = (
            this.config.get<string>(LOCAL_APP_API_URL_ENV) ??
            LOCAL_APP_DEFAULT_API_URL
        ).replace(/\/+$/, '');
        return {
            domain,
            setup: {
                devSectionUrl: localAppDevSectionUrl(domain),
                handlerUrl: `${apiUrl}${LOCAL_APP_PATHS.handler}`,
                installUrl: `${apiUrl}${LOCAL_APP_PATHS.install}`,
                scopes: [...LOCAL_APP_SCOPES],
            },
            keys: {
                set: keys !== null,
                clientId: keys?.clientId ?? null,
                updatedAt: keys?.updatedAt ?? null,
            },
            install: {
                installed: install !== null,
                status: install?.install_status ?? null,
                installedAt: install?.installed_at ?? null,
                tokenExpiresAt: install?.expires_at ?? null,
            },
            lastRefresh,
        };
    }

    /** @throws BadRequestException — ключи не похожи на ключи локального приложения */
    async saveKeys(
        portal: LocalAppPortalRef,
        input: LocalAppKeysInput,
    ): Promise<LocalAppConnection> {
        const domain = this.domainOf(portal);
        const clientId = input.clientId.trim();
        const clientSecret = input.clientSecret.trim();
        if (!LOCAL_APP_CLIENT_ID_RE.test(clientId)) {
            throw new BadRequestException(
                'Код приложения (client_id) должен быть вида local.xxxxxxxx.xxxxxxxx — скопируйте его из карточки локального приложения в Битрикс24',
            );
        }
        if (!LOCAL_APP_CLIENT_SECRET_RE.test(clientSecret)) {
            throw new BadRequestException(
                'Ключ приложения (client_secret) пустой или с пробелами — скопируйте его из карточки локального приложения',
            );
        }
        await this.keys.saveKeys(
            codesOf(portal, domain),
            clientId,
            clientSecret,
        );
        this.secrets.forget({ memberId: portal.memberId, domain });
        this.logger.log(`Ключи локального приложения сохранены: ${domain}`);
        return this.status(portal);
    }

    /** Пробное обновление токена: ключи подходят к установленному приложению? */
    async check(portal: LocalAppPortalRef): Promise<LocalAppCheck> {
        const domain = this.domainOf(portal);
        try {
            await this.tokens.forceRefresh(
                portal.memberId ? { memberId: portal.memberId } : { domain },
            );
            return { result: 'ok', message: CHECK_MESSAGES.ok };
        } catch (error) {
            if (!(error instanceof MarketplaceTokenError)) throw error;
            const result = CHECK_BY_ERROR[error.code] ?? 'unavailable';
            return { result, message: CHECK_MESSAGES[result] };
        }
    }

    private domainOf(portal: LocalAppPortalRef): string {
        const domain = portal.domain
            ? normalizePortalDomain(portal.domain)
            : '';
        if (!domain) {
            throw new BadRequestException(
                'У портала не указан домен Битрикс24 — подключение невозможно',
            );
        }
        return domain;
    }
}

/** Коды строк ключей: по member_id (если уже известен) и по домену. */
function codesOf(portal: LocalAppPortalRef, domain: string): string[] {
    return [
        portal.memberId ? localAppSecretCodeByMemberId(portal.memberId) : null,
        localAppSecretCodeByDomain(domain),
    ].filter((code): code is string => code !== null);
}
