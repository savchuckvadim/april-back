import { User } from 'generated/prisma';
import { isCabinetRole, CabinetRole } from '../domain/cabinet.constants';
import { MembershipWithUser } from '../persistence/cabinet-membership.repository';

/** Участник кабинета портала — для ответов API (id-шники числами). */
export interface CabinetMemberView {
    id: string;
    userId: number;
    email: string | null;
    firstName: string;
    lastName: string;
    role: CabinetRole;
    bitrixUserId: string | null;
    revoked: boolean;
    /** Пароль задан — может входить с сайта. */
    hasPassword: boolean;
    createdAt: string | null;
}

/** Маска email для экранов без прав: `a***@mail.ru`. */
export function maskEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const [local, domain] = email.split('@');
    if (!local || !domain) return null;
    return `${local.slice(0, 1)}***@${domain}`;
}

export function toMemberView(
    row: MembershipWithUser,
    hasPassword: (user: User) => boolean,
): CabinetMemberView {
    return {
        id: row.id,
        userId: Number(row.userId),
        email: row.user.email,
        firstName: row.user.name,
        lastName: row.user.surname,
        role: isCabinetRole(row.role) ? row.role : 'member',
        bitrixUserId: row.bitrixUserId,
        revoked: row.revokedAt !== null,
        hasPassword: hasPassword(row.user),
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
}
