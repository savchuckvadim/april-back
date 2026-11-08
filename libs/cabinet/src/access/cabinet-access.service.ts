import {
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { Portal } from 'generated/prisma';
import { AuthUser } from '@lib/auth';
import { CabinetAccessLevel, isCabinetRole } from '../domain/cabinet.constants';
import {
    CabinetContext,
    CabinetMembershipRef,
} from '../domain/cabinet-context';
import {
    CabinetAccountSubject,
    CabinetFrameSubject,
    toCabinetSubject,
} from '../domain/cabinet-subject';
import {
    CabinetPortalRepository,
    toCabinetPortalRef,
} from '../persistence/cabinet-portal.repository';
import { CabinetMembershipRepository } from '../persistence/cabinet-membership.repository';
import { CabinetUserRepository } from '../persistence/cabinet-user.repository';

/**
 * Контекст запроса кабинета: кто пришёл, к какому порталу и с каким
 * уровнем доступа. Уровень — из БД (portal_users) на каждый запрос, а
 * не из токена: снятый доступ и переданные права действуют сразу.
 *
 * Правила:
 * - администратор April — любой портал, уровень `platform`;
 * - учётка (вход с сайта) — только порталы, где есть действующее
 *   членство (не заявка), уровень = роль;
 * - сотрудник из фрейма — только портал своей сессии; с членством —
 *   уровень роли, без — `frame`;
 * - портал, отключённый вендором (`blocked`), закрыт всем, кроме April.
 */
@Injectable()
export class CabinetAccessService {
    constructor(
        private readonly portals: CabinetPortalRepository,
        private readonly memberships: CabinetMembershipRepository,
        private readonly users: CabinetUserRepository,
    ) {}

    async resolve(user: AuthUser, portalId?: bigint): Promise<CabinetContext> {
        const subject = toCabinetSubject(user);
        if (!subject) {
            throw new UnauthorizedException(
                'Токен не подходит кабинету — войдите заново',
            );
        }
        if (subject.kind === 'platform') {
            const portal =
                portalId !== undefined
                    ? await this.requirePortal(portalId)
                    : null;
            return {
                subject,
                portal: portal ? toCabinetPortalRef(portal) : null,
                level: 'platform',
                membership: null,
            };
        }
        if (subject.kind === 'account') {
            return this.resolveAccount(subject, portalId);
        }
        return this.resolveFrame(subject, portalId);
    }

    private async resolveAccount(
        subject: CabinetAccountSubject,
        portalId?: bigint,
    ): Promise<CabinetContext> {
        const account = await this.users.findById(subject.userId);
        if (!account) {
            throw new UnauthorizedException(
                'Учётная запись не найдена — войдите заново',
            );
        }
        if (portalId === undefined) {
            return { subject, portal: null, level: 'member', membership: null };
        }
        const membership = await this.memberships.findByPortalUser(
            portalId,
            subject.userId,
        );
        const ref = toMembershipRef(membership);
        if (!ref || ref.role === 'pending') {
            throw new ForbiddenException('Нет доступа к этому порталу');
        }
        const portal = this.assertOpen(await this.requirePortal(portalId));
        return {
            subject,
            portal: toCabinetPortalRef(portal),
            level: ref.role,
            membership: ref,
        };
    }

    private async resolveFrame(
        subject: CabinetFrameSubject,
        portalId?: bigint,
    ): Promise<CabinetContext> {
        const portal = await this.portals.findByLookup(subject.portal);
        if (!portal) {
            throw new NotFoundException(
                'Портал сессии не найден — переоткройте приложение из Битрикс24',
            );
        }
        if (portalId !== undefined && portalId !== portal.id) {
            throw new ForbiddenException(
                'Сессия открыта на другом портале — переоткройте приложение на нужном портале',
            );
        }
        this.assertOpen(portal);
        const membership = toMembershipRef(
            await this.memberships.findActiveByBitrix(
                portal.id,
                subject.bitrixUserId,
            ),
        );
        const level: CabinetAccessLevel =
            membership && membership.role !== 'pending'
                ? membership.role
                : 'frame';
        return {
            subject,
            portal: toCabinetPortalRef(portal),
            level,
            membership,
        };
    }

    private async requirePortal(portalId: bigint): Promise<Portal> {
        const portal = await this.portals.findById(portalId);
        if (!portal) {
            throw new NotFoundException('Портал не найден');
        }
        return portal;
    }

    private assertOpen(portal: Portal): Portal {
        if (portal.approval_status === 'blocked') {
            throw new ForbiddenException(
                'Подключение портала к April приостановлено — напишите нам: april-app@mail.ru',
            );
        }
        return portal;
    }
}

function toMembershipRef(
    row: {
        id: string;
        userId: bigint;
        role: string;
        bitrixUserId: string | null;
        revokedAt: Date | null;
    } | null,
): CabinetMembershipRef | null {
    if (!row || row.revokedAt || !isCabinetRole(row.role)) {
        return null;
    }
    return {
        id: row.id,
        userId: row.userId,
        role: row.role,
        bitrixUserId: row.bitrixUserId,
    };
}
