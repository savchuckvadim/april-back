import { AuthUser, Role } from '@lib/auth';
import { CABINET_ACCOUNT_SUB_PREFIX } from './cabinet.constants';

/** Как найти портал по данным токена фрейма. */
export interface CabinetPortalLookup {
    portalId?: number;
    memberId?: string;
    domain?: string;
}

/** Администратор April (SUPER_USER из админки). */
export interface CabinetPlatformSubject {
    kind: 'platform';
    login: string;
}

/** Учётная запись кабинета (вход с сайта по email и паролю). */
export interface CabinetAccountSubject {
    kind: 'account';
    userId: bigint;
    login: string;
}

/** Сотрудник портала из фрейма Битрикса (сессия проверена REST-вызовом). */
export interface CabinetFrameSubject {
    kind: 'frame';
    bitrixUserId: string;
    /** Администратор портала Битрикс24 (из профиля при открытии сессии). */
    isAdmin: boolean;
    portal: CabinetPortalLookup;
    login: string;
}

export type CabinetSubject =
    | CabinetPlatformSubject
    | CabinetAccountSubject
    | CabinetFrameSubject;

/**
 * Субъект кабинета из проверенного JWT (общий секрет приложений).
 *
 * Токены бывают трёх видов, и порядок проверок важен:
 * 1. SUPER_USER — администратор April;
 * 2. CLIENT с `sub=user:<id>` — вход с сайта (учётка `users`);
 * 3. CLIENT с `bitrixUserId` — сессия фрейма: маркетплейс/локальное
 *    приложение (`sub=member_id`, `portalId`) или фреймы продуктов
 *    (`sub=portal:<домен>:<id>`, `domain`).
 *
 * Остальное (сервисные токены, мусор) — null: кабинету не субъект.
 */
export function toCabinetSubject(user: AuthUser): CabinetSubject | null {
    if (user.role === Role.SUPER_USER) {
        return { kind: 'platform', login: user.login };
    }
    if (user.role !== Role.CLIENT) {
        return null;
    }
    if (user.sub.startsWith(CABINET_ACCOUNT_SUB_PREFIX)) {
        const userId = parseUserId(
            user.userId ?? user.sub.slice(CABINET_ACCOUNT_SUB_PREFIX.length),
        );
        return userId === null
            ? null
            : { kind: 'account', userId, login: user.login };
    }
    if (!user.bitrixUserId) {
        return null;
    }
    const portal: CabinetPortalLookup = {
        ...(user.portalId !== undefined ? { portalId: user.portalId } : {}),
        ...(user.memberId ? { memberId: user.memberId } : {}),
        ...(user.domain ? { domain: user.domain } : {}),
    };
    if (!portal.portalId && !portal.memberId && !portal.domain) {
        return null;
    }
    return {
        kind: 'frame',
        bitrixUserId: user.bitrixUserId,
        isAdmin: user.isAdmin === true,
        portal,
        login: user.login,
    };
}

function parseUserId(raw: number | string): bigint | null {
    const text = String(raw).trim();
    return /^\d+$/.test(text) && text !== '0' ? BigInt(text) : null;
}
