import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthTokenService, Role } from '@lib/auth';
import { RedisService } from '@/core/redis/redis.service';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import { BitrixOpenPayload } from '../lib/parse-install-params.util';

/**
 * Сессия портала («гейт + сессия», этап 1 задачи
 * ai/tasks/bitrix-marketplace-client-onboarding.md).
 *
 * Пользователь, открывший приложение в iframe Битрикса, уже аутентифицирован
 * фактом установки — логин не нужен. При каждом открытии:
 *  1) верификация запроса: установка по member_id + сверка application_token
 *     + REST-проверка присланного AUTH_ID живым вызовом `profile`
 *     (закрывает этап 8.3 publication-plan: query больше не на доверии);
 *  2) вычисление состояния допуска (onboarding/pending/active/blocked) из
 *     portals.approval_status и наличия клиента; легаси (NULL) = active;
 *  3) выпуск короткоживущего portal-context JWT (канон AuthUser из
 *     centralized-auth: role=CLIENT, portalId, clientId?) через
 *     AuthTokenService (@lib/auth, общий AUTH_JWT_SECRET → SSO);
 *  4) токен НЕ кладётся в redirect-URL: фронт получает ОДНОРАЗОВЫЙ code
 *     (Redis, TTL 60с) и меняет его на токен POST-ом
 *     /bitrix-marketplace/session/exchange. Токен живёт в памяти фронта и
 *     ходит Bearer'ом — без cookies, значит без проблем SameSite/CHIPS
 *     в iframe (решение открытого вопроса №1 задачи онбординга).
 */

/** Состояние допуска портала для маршрутизации фронта */
export enum PortalSessionState {
    /** Клиент не привязан — показать онбординг-форму (организация+email) */
    ONBOARDING = 'onboarding',
    /** Заявка подана, ждёт одобрения вендора */
    PENDING = 'pending',
    /** Допущен — полноценный кабинет */
    ACTIVE = 'active',
    /** Отключён вендором */
    BLOCKED = 'blocked',
}

export interface OpenSessionResult {
    ok: boolean;
    state?: PortalSessionState;
    /** Одноразовый код обмена на portal-context JWT */
    code?: string;
    /** Причина отказа (ok=false): not_installed | token_mismatch | rest_verify_failed | no_context */
    reason?: string;
}

export interface ExchangedSession {
    token: string;
    state: PortalSessionState;
    domain?: string;
    memberId: string;
    user: {
        name?: string;
        lastName?: string;
        isAdmin: boolean;
        /** Email из user.current — предзаполнение онбординг-формы */
        email?: string;
    };
}

const CODE_TTL_SECONDS = 60;
const CODE_KEY_PREFIX = 'mp:session:code:';

/**
 * Состояние допуска: легаси-порталы (approval_status IS NULL) считаются
 * допущенными (зафиксировано в db-changes.md); blocked — жёсткий гейт;
 * pending без клиента = онбординг ещё не пройден.
 * Общая функция сессии и онбординга.
 */
export function computePortalSessionState(
    approvalStatus: string | null,
    clientId: bigint | null,
): PortalSessionState {
    if (approvalStatus === 'blocked') {
        return PortalSessionState.BLOCKED;
    }
    if (approvalStatus === null || approvalStatus === 'approved') {
        return PortalSessionState.ACTIVE;
    }
    // approval_status === 'pending'
    return clientId === null
        ? PortalSessionState.ONBOARDING
        : PortalSessionState.PENDING;
}

@Injectable()
export class MarketplaceSessionService {
    private readonly logger = new Logger(MarketplaceSessionService.name);
    private readonly appCode = BITRIX_APP_CODES.GARANT as string;

    constructor(
        private readonly repository: MarketplaceInstallRepository,
        private readonly bxClient: MarketplaceBxClient,
        private readonly authTokenService: AuthTokenService,
        private readonly redisService: RedisService,
    ) {}

    /** Верификация открытия + выпуск одноразового кода сессии */
    async openSession(payload: BitrixOpenPayload): Promise<OpenSessionResult> {
        if (!payload.member_id || !payload.access_token || !payload.domain) {
            return { ok: false, reason: 'no_context' };
        }

        const install = await this.repository.findInstallWithClient(
            payload.member_id,
            this.appCode,
        );
        if (!install || install.uninstalled_at) {
            this.logger.warn(
                `Session rejected: установка не найдена (member_id=${payload.member_id})`,
            );
            return { ok: false, reason: 'not_installed' };
        }

        // Сверка application_token (если обе стороны его знают)
        const stored = this.repository.getApplicationToken(install);
        if (
            stored &&
            payload.application_token &&
            stored !== payload.application_token
        ) {
            this.logger.warn(
                `Session rejected: application_token mismatch (member_id=${payload.member_id})`,
            );
            return { ok: false, reason: 'token_mismatch' };
        }

        // REST-верификация присланного AUTH_ID: подделанный/мёртвый не пройдёт
        const profile = await this.bxClient.getProfile(
            payload.domain,
            payload.access_token,
        );
        if (!profile.ok) {
            this.logger.warn(
                `Session rejected: profile REST failed (domain=${payload.domain}, error=${profile.error ?? '-'})`,
            );
            return { ok: false, reason: 'rest_verify_failed' };
        }

        const portal = install.portals;
        const state = computePortalSessionState(
            portal.approval_status,
            portal.client_id,
        );

        const token = this.authTokenService.sign({
            sub: payload.member_id,
            login: profile.id
                ? `bx-user:${profile.id}@${payload.member_id}`
                : payload.member_id,
            role: Role.CLIENT,
            portalId: Number(portal.id),
            ...(portal.client_id !== null
                ? { clientId: Number(portal.client_id) }
                : {}),
        });

        // Email нужен только онбординг-форме (предзаполнение) — лишний
        // REST-вызов на каждое открытие active-портала не делаем.
        const email =
            state === PortalSessionState.ONBOARDING
                ? await this.bxClient.getCurrentUserEmail(
                      payload.domain,
                      payload.access_token,
                  )
                : undefined;

        const session: ExchangedSession = {
            token,
            state,
            domain: payload.domain,
            memberId: payload.member_id,
            user: {
                name: profile.name,
                lastName: profile.lastName,
                isAdmin: profile.isAdmin,
                ...(email ? { email } : {}),
            },
        };

        const code = randomUUID();
        await this.redisService
            .getClient()
            .set(
                `${CODE_KEY_PREFIX}${code}`,
                JSON.stringify(session),
                'EX',
                CODE_TTL_SECONDS,
            );

        return { ok: true, state, code };
    }

    /** Обмен одноразового кода на сессию (код сжигается) */
    async exchangeCode(code: string): Promise<ExchangedSession | null> {
        const key = `${CODE_KEY_PREFIX}${code}`;
        const client = this.redisService.getClient();
        const raw = await client.get(key);
        if (!raw) {
            return null;
        }
        await client.del(key);
        try {
            return JSON.parse(raw) as ExchangedSession;
        } catch {
            this.logger.warn('Session exchange: повреждённые данные кода');
            return null;
        }
    }
}
