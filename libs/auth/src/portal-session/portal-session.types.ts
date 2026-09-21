import { PortalSessionOpenFailure } from './portal-session.const';

/** Что фронт присылает из BX24.getAuth() для открытия сессии. */
export interface PortalSessionOpenInput {
    domain: string;
    /** AUTH_ID фрейма — access_token текущего пользователя портала. */
    accessToken: string;
    /** member_id портала — только для журналирования. */
    memberId?: string;
}

/** Пользователь портала по данным REST-метода `profile`. */
export interface PortalSessionUser {
    /** Bitrix-id пользователя (строкой, как в REST). */
    id: string;
    name: string | null;
    lastName: string | null;
    /** Администратор портала (profile.ADMIN). */
    isAdmin: boolean;
}

/** Открытая сессия: токен и кто его получил. */
export interface PortalSession {
    /** portal-context JWT (role=CLIENT, domain, bitrixUserId, isAdmin). */
    token: string;
    /** Истечение токена, ISO (UTC); null — токен без срока. */
    expiresAt: string | null;
    domain: string;
    user: PortalSessionUser;
}

export type PortalSessionOpenResult =
    | { ok: true; session: PortalSession }
    | { ok: false; reason: PortalSessionOpenFailure; message: string };
