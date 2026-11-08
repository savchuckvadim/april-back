import { Request } from 'express';
import { AuthUser } from '@lib/auth';
import { CabinetAccessLevel, CabinetRole } from './cabinet.constants';
import { CabinetSubject } from './cabinet-subject';

/** Портал в контексте запроса кабинета. */
export interface CabinetPortalRef {
    id: bigint;
    domain: string | null;
    memberId: string | null;
    clientId: bigint | null;
    approvalStatus: string | null;
}

/** Членство субъекта в портале (portal_users), если есть. */
export interface CabinetMembershipRef {
    id: string;
    userId: bigint;
    role: CabinetRole;
    bitrixUserId: string | null;
}

/**
 * Что гард кабинета кладёт в запрос: кто пришёл, к какому порталу и с
 * каким уровнем. Уровень считается по БД на каждый запрос (portal_users),
 * а не по токену: отзыв доступа действует сразу.
 */
export interface CabinetContext {
    subject: CabinetSubject;
    /** Портал запроса; нет — ручка без портала (мои порталы, профиль). */
    portal: CabinetPortalRef | null;
    level: CabinetAccessLevel;
    membership: CabinetMembershipRef | null;
}

/** Запрос, прошедший гард кабинета. */
export interface CabinetRequest extends Request {
    user?: AuthUser;
    cabinet?: CabinetContext;
}

/** Метка действия в журнале: кто сделал (логин админа, user:<id>, frame:<bitrix id>). */
export function cabinetActorLabel(subject: CabinetSubject): string {
    switch (subject.kind) {
        case 'platform':
            return `admin:${subject.login}`;
        case 'account':
            return `user:${subject.userId}`;
        case 'frame':
            return `frame:${subject.bitrixUserId}`;
    }
}
