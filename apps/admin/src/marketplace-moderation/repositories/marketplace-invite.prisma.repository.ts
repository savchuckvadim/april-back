import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core';
import { Client } from 'generated/prisma';
import {
    CreateInviteInput,
    InvitesFilter,
    InviteWithRelations,
    MarketplaceInviteRepository,
} from './marketplace-invite.repository';

/** Prisma-реализация хранилища кодов подключения (общая схема монорепо) */
@Injectable()
export class MarketplaceInvitePrismaRepository
    implements MarketplaceInviteRepository
{
    /** Связи, нужные карточке кода в админке */
    private readonly relations = { clients: true, portals: true } as const;

    constructor(private readonly prisma: PrismaService) {}

    async findInvites(filter: InvitesFilter): Promise<InviteWithRelations[]> {
        return this.prisma.portal_invites.findMany({
            where: {
                ...(filter.status ? { status: filter.status } : {}),
                ...(filter.email ? { email: { contains: filter.email } } : {}),
            },
            include: this.relations,
            orderBy: { created_at: 'desc' },
        });
    }

    async findInviteById(id: string): Promise<InviteWithRelations | null> {
        return this.prisma.portal_invites.findUnique({
            where: { id },
            include: this.relations,
        });
    }

    async findClientByEmail(email: string): Promise<Client | null> {
        return this.prisma.client.findFirst({ where: { email } });
    }

    async createClient(input: {
        name: string;
        email: string;
    }): Promise<Client> {
        const now = new Date();
        return this.prisma.client.create({
            data: {
                name: input.name,
                email: input.email,
                status: 'pending',
                is_active: true,
                created_at: now,
                updated_at: now,
            },
        });
    }

    async createInvite(input: CreateInviteInput): Promise<InviteWithRelations> {
        const now = new Date();
        return this.prisma.portal_invites.create({
            data: {
                id: randomUUID(),
                code_hash: input.codeHash,
                code_prefix: input.codePrefix,
                client_id: input.clientId,
                email: input.email,
                organization: input.organization,
                product_code: input.productCode,
                auto_provision: input.autoProvision,
                status: 'issued',
                expires_at: input.expiresAt,
                issued_by: input.issuedBy,
                note: input.note,
                created_at: now,
                updated_at: now,
            },
            include: this.relations,
        });
    }

    async markInviteSent(id: string, sentAt: Date): Promise<void> {
        await this.prisma.portal_invites.update({
            where: { id },
            data: { status: 'sent', sent_at: sentAt, updated_at: sentAt },
        });
    }

    async revokeInvite(
        id: string,
        revokedAt: Date,
        revokedBy?: string,
    ): Promise<void> {
        await this.prisma.portal_invites.update({
            where: { id },
            data: {
                status: 'revoked',
                revoked_at: revokedAt,
                revoked_by: revokedBy,
                updated_at: revokedAt,
            },
        });
    }
}
