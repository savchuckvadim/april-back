import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Client, Portal, PortalUser, User } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { CabinetRole } from '../domain/cabinet.constants';

export type MembershipWithUser = PortalUser & { user: User };
export type MembershipWithPortal = PortalUser & {
    portal: Portal & { clients: Client | null };
};

export interface UpsertMembershipInput {
    portalId: bigint;
    userId: bigint;
    role: CabinetRole;
    bitrixUserId?: string | null;
    invitedBy: string;
}

/**
 * Членство учёток в порталах (`portal_users`). Отзыв — `revoked_at`, строка
 * остаётся (история «кто имел доступ»). Повторное приглашение отозванного
 * человека оживляет ту же строку.
 */
@Injectable()
export class CabinetMembershipRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Все строки портала с учётками (и отозванные — для истории). */
    listByPortal(portalId: bigint): Promise<MembershipWithUser[]> {
        return this.prisma.portalUser.findMany({
            where: { portalId },
            include: { user: true },
            orderBy: [{ revokedAt: 'asc' }, { createdAt: 'asc' }],
        });
    }

    /** Действующие членства учётки (без заявок и отозванных). */
    listActiveByUser(userId: bigint): Promise<MembershipWithPortal[]> {
        return this.prisma.portalUser.findMany({
            where: { userId, revokedAt: null, role: { not: 'pending' } },
            include: { portal: { include: { clients: true } } },
            orderBy: { createdAt: 'asc' },
        });
    }

    findById(id: string): Promise<MembershipWithUser | null> {
        return this.prisma.portalUser.findUnique({
            where: { id },
            include: { user: true },
        });
    }

    findByPortalUser(
        portalId: bigint,
        userId: bigint,
    ): Promise<PortalUser | null> {
        return this.prisma.portalUser.findUnique({
            where: { portalId_userId: { portalId, userId } },
        });
    }

    /** Действующее членство сотрудника портала по его ID в Битриксе. */
    findActiveByBitrix(
        portalId: bigint,
        bitrixUserId: string,
    ): Promise<PortalUser | null> {
        return this.prisma.portalUser.findFirst({
            where: { portalId, bitrixUserId, revokedAt: null },
            orderBy: { createdAt: 'asc' },
        });
    }

    countOwners(portalId: bigint): Promise<number> {
        return this.prisma.portalUser.count({
            where: { portalId, role: 'owner', revokedAt: null },
        });
    }

    async upsert(input: UpsertMembershipInput): Promise<PortalUser> {
        const now = new Date();
        const existing = await this.findByPortalUser(
            input.portalId,
            input.userId,
        );
        if (existing) {
            return this.prisma.portalUser.update({
                where: { id: existing.id },
                data: {
                    role: input.role,
                    revokedAt: null,
                    invitedBy: input.invitedBy,
                    ...(input.bitrixUserId
                        ? { bitrixUserId: input.bitrixUserId }
                        : {}),
                    updatedAt: now,
                },
            });
        }
        return this.prisma.portalUser.create({
            data: {
                id: randomUUID(),
                portalId: input.portalId,
                userId: input.userId,
                role: input.role,
                bitrixUserId: input.bitrixUserId ?? null,
                invitedBy: input.invitedBy,
                createdAt: now,
                updatedAt: now,
            },
        });
    }

    setRole(id: string, role: CabinetRole): Promise<PortalUser> {
        return this.prisma.portalUser.update({
            where: { id },
            data: { role, updatedAt: new Date() },
        });
    }

    revoke(id: string): Promise<PortalUser> {
        return this.prisma.portalUser.update({
            where: { id },
            data: { revokedAt: new Date(), updatedAt: new Date() },
        });
    }

    /**
     * Передача прав владельца: все действующие владельцы портала → участники,
     * выбранное членство → владелец. Одной транзакцией: портал без владельца
     * или с двумя «полувладельцами» после сбоя недопустим.
     */
    async transferOwnership(
        portalId: bigint,
        membershipId: string,
    ): Promise<PortalUser> {
        const now = new Date();
        return this.prisma.$transaction(async tx => {
            await tx.portalUser.updateMany({
                where: {
                    portalId,
                    role: 'owner',
                    revokedAt: null,
                    id: { not: membershipId },
                },
                data: { role: 'member', updatedAt: now },
            });
            return tx.portalUser.update({
                where: { id: membershipId },
                data: { role: 'owner', revokedAt: null, updatedAt: now },
            });
        });
    }
}
