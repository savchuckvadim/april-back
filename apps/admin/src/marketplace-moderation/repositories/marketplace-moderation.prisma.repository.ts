import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core';
import {
    bitrix_app_events,
    marketplace_install_components,
    portal_products,
} from 'generated/prisma';
import {
    EventsFilter,
    InstallsFilter,
    InstallWithComponents,
    InstallWithPortal,
    MarketplaceModerationRepository,
    ModerationPortal,
} from './marketplace-moderation.repository';

/** Prisma-реализация хранилища модерации (общая схема монорепо) */
@Injectable()
export class MarketplaceModerationPrismaRepository
    implements MarketplaceModerationRepository
{
    private readonly logger = new Logger(
        MarketplaceModerationPrismaRepository.name,
    );

    constructor(private readonly prisma: PrismaService) {}

    async findApplications(filter: {
        approvalStatus?: string;
    }): Promise<ModerationPortal[]> {
        return this.prisma.portal.findMany({
            where: {
                source: 'marketplace',
                ...(filter.approvalStatus
                    ? { approval_status: filter.approvalStatus }
                    : {}),
            },
            include: {
                clients: true,
                marketplace_installs: true,
            },
            orderBy: { id: 'desc' },
        });
    }

    async findPortalById(portalId: bigint): Promise<ModerationPortal | null> {
        return this.prisma.portal.findUnique({
            where: { id: portalId },
            include: {
                clients: true,
                marketplace_installs: true,
            },
        });
    }

    async updateClientStatus(
        clientId: bigint,
        status: 'active' | 'disabled',
    ): Promise<void> {
        await this.prisma.client.update({
            where: { id: clientId },
            data: {
                status,
                is_active: status === 'active',
                updated_at: new Date(),
            },
        });
    }

    async setPortalBlocked(portalId: bigint): Promise<void> {
        await this.prisma.portal.update({
            where: { id: portalId },
            data: { approval_status: 'blocked' },
        });
    }

    async findComponentsByPortal(
        portalId: bigint,
    ): Promise<marketplace_install_components[]> {
        return this.prisma.marketplace_install_components.findMany({
            where: { portal_id: portalId },
            orderBy: [{ component_type: 'asc' }, { component_code: 'asc' }],
        });
    }

    async findInstalls(filter: InstallsFilter): Promise<InstallWithPortal[]> {
        return this.prisma.marketplace_installs.findMany({
            where: {
                ...(filter.installStatus
                    ? { install_status: filter.installStatus }
                    : {}),
                portals: {
                    ...(filter.memberId ? { member_id: filter.memberId } : {}),
                    ...(filter.domain
                        ? { domain: { contains: filter.domain } }
                        : {}),
                },
            },
            include: {
                portals: true,
                _count: { select: { marketplace_install_components: true } },
            },
            orderBy: { updated_at: 'desc' },
        });
    }

    async findInstallById(
        installId: string,
    ): Promise<InstallWithComponents | null> {
        return this.prisma.marketplace_installs.findUnique({
            where: { id: installId },
            include: {
                portals: true,
                marketplace_install_components: {
                    orderBy: [
                        { component_type: 'asc' },
                        { component_code: 'asc' },
                    ],
                },
            },
        });
    }

    async findEvents(
        filter: EventsFilter,
    ): Promise<{ items: bitrix_app_events[]; total: number }> {
        const where = {
            ...(filter.memberId ? { member_id: filter.memberId } : {}),
            ...(filter.domain ? { domain: { contains: filter.domain } } : {}),
            ...(filter.event ? { event: filter.event } : {}),
            ...(filter.status ? { status: filter.status } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.bitrix_app_events.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take: filter.take,
                skip: filter.skip,
            }),
            this.prisma.bitrix_app_events.count({ where }),
        ]);
        return { items, total };
    }

    async findPortalProducts(portalId: bigint): Promise<portal_products[]> {
        return this.prisma.portal_products.findMany({
            where: { portal_id: portalId },
            orderBy: { product_code: 'asc' },
        });
    }

    async logModerationEvent(input: {
        memberId?: string;
        domain?: string;
        event: string;
        status: 'processed' | 'error';
        payload?: string;
        errorDetail?: string;
    }): Promise<void> {
        try {
            await this.prisma.bitrix_app_events.create({
                data: {
                    id: randomUUID(),
                    member_id: input.memberId,
                    domain: input.domain,
                    event: input.event,
                    status: input.status,
                    payload: input.payload,
                    error_detail: input.errorDetail,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        } catch (error) {
            // журнал не должен ронять модерацию
            this.logger.warn(
                `logModerationEvent failed: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
