import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { PbxEntityTypePrisma } from 'src/shared/enums';
import {
    ContractTypeItemOption,
    CONTRACT_TYPE_FIELD_CODE,
    PortalContractFormData,
    SelectOption,
} from './portal-contract-form.types';

/**
 * Сбор initial-данных для формы создания `portal_contract`
 * (аналог legacy `PortalContract::getForm`).
 *
 * Read-only агрегатор по PortalDB: собирает select-опции для четырёх relation-полей
 * формы — `portal_id`, `contract_id`, `portal_measure_id`, `bitrixfield_item_id`
 * (последнее — items поля `contract_type` сделки портала).
 */
@Injectable()
export class PortalContractFormService {
    constructor(private readonly prisma: PrismaService) {}

    async getForm(portalId: number): Promise<PortalContractFormData> {
        const [portals, contracts, portalMeasures, contractTypeItems] =
            await Promise.all([
                this.getPortalOptions(),
                this.getContractOptions(),
                this.getPortalMeasureOptions(portalId),
                this.getContractTypeItems(portalId),
            ]);

        return { portals, contracts, portalMeasures, contractTypeItems };
    }

    private async getPortalOptions(): Promise<SelectOption[]> {
        const portals = await this.prisma.portal.findMany({
            select: { id: true, domain: true },
        });
        return portals.map(portal => ({
            id: Number(portal.id),
            name: portal.domain ?? '',
            title: portal.domain ?? '',
        }));
    }

    private async getContractOptions(): Promise<SelectOption[]> {
        const contracts = await this.prisma.contracts.findMany({
            select: { id: true, name: true, title: true },
        });
        return contracts.map(contract => ({
            id: Number(contract.id),
            name: contract.name,
            title: contract.title,
        }));
    }

    private async getPortalMeasureOptions(
        portalId: number,
    ): Promise<SelectOption[]> {
        const portalMeasures = await this.prisma.portal_measure.findMany({
            where: { portal_id: BigInt(portalId) },
            include: { measures: true },
        });
        return portalMeasures.map(pm => {
            const label = pm.name ?? pm.measures?.name ?? '';
            return {
                id: Number(pm.id),
                name: label,
                title: label,
            };
        });
    }

    private async getContractTypeItems(
        portalId: number,
    ): Promise<ContractTypeItemOption[]> {
        const deals = await this.prisma.btx_deals.findMany({
            where: { portal_id: BigInt(portalId) },
            select: { id: true },
        });
        if (deals.length === 0) {
            return [];
        }

        const fields = await this.prisma.bitrixfields.findMany({
            where: {
                entity_type: PbxEntityTypePrisma.DEAL,
                entity_id: { in: deals.map(deal => deal.id) },
                code: CONTRACT_TYPE_FIELD_CODE,
            },
            include: { bitrixfield_items: true },
        });

        return fields.flatMap(field =>
            field.bitrixfield_items.map(item => ({
                id: Number(item.id),
                name: item.title,
                title: item.title,
                code: item.code,
                bitrixId: item.bitrixId,
            })),
        );
    }
}
