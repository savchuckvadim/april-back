import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core';

/**
 * По-компонентные статусы установки маркетплейс-приложения
 * (marketplace_install_components). Общий код: apps/pbx пишет статусы
 * placement/smart_scenario при установке, воркер apps/pbx-install —
 * статусы pbx_entities при provisioning.
 */

/** Оси компонентов установки (component_type) */
export enum MarketplaceComponentType {
    PLACEMENT = 'placement',
    SMART_SCENARIO = 'smart_scenario',
    PBX_ENTITIES = 'pbx_entities',
}

export type ComponentStatus =
    | 'pending'
    | 'installing'
    | 'installed'
    | 'error'
    | 'unavailable'
    | 'skipped';

export interface ComponentStateInput {
    productCode: string;
    componentType: MarketplaceComponentType;
    componentCode: string;
    status: ComponentStatus;
    reasonCode?: string;
    errorDetail?: string;
}

@Injectable()
export class MarketplaceComponentStateRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Upsert статусов по уникальному ключу компонента (attempts++ при update) */
    async upsertComponents(
        installId: string,
        portalId: bigint,
        items: ComponentStateInput[],
    ): Promise<void> {
        for (const item of items) {
            await this.prisma.marketplace_install_components.upsert({
                where: {
                    marketplace_install_id_product_code_component_type_component_code:
                        {
                            marketplace_install_id: installId,
                            product_code: item.productCode,
                            component_type: item.componentType,
                            component_code: item.componentCode,
                        },
                },
                update: {
                    status: item.status,
                    reason_code: item.reasonCode ?? null,
                    error_detail: item.errorDetail ?? null,
                    attempts: { increment: 1 },
                    last_attempt_at: new Date(),
                    updated_at: new Date(),
                },
                create: {
                    id: randomUUID(),
                    marketplace_install_id: installId,
                    portal_id: portalId,
                    product_code: item.productCode,
                    component_type: item.componentType,
                    component_code: item.componentCode,
                    status: item.status,
                    reason_code: item.reasonCode,
                    error_detail: item.errorDetail,
                    attempts: 1,
                    last_attempt_at: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });
        }
    }

    /** Единичный upsert (прогресс шага provisioning) */
    async setComponentStatus(
        installId: string,
        portalId: bigint,
        item: ComponentStateInput,
    ): Promise<void> {
        await this.upsertComponents(installId, portalId, [item]);
    }

    /** Общий статус установки (state machine marketplace_installs) */
    async setInstallStatus(
        installId: string,
        status: string,
        errorStep?: string,
        errorDetail?: string,
    ): Promise<void> {
        await this.prisma.marketplace_installs.update({
            where: { id: installId },
            data: {
                install_status: status,
                error_step: errorStep ?? null,
                error_detail: errorDetail ?? null,
                updated_at: new Date(),
            },
        });
    }

    /** Статусы компонентов продукта (readiness-гейт роутера, кабинет) */
    async findComponents(filter: {
        installId: string;
        productCode?: string;
        componentType?: MarketplaceComponentType;
    }) {
        return this.prisma.marketplace_install_components.findMany({
            where: {
                marketplace_install_id: filter.installId,
                ...(filter.productCode
                    ? { product_code: filter.productCode }
                    : {}),
                ...(filter.componentType
                    ? { component_type: filter.componentType }
                    : {}),
            },
            orderBy: { component_code: 'asc' },
        });
    }
}
