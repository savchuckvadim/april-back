import { Injectable, NotFoundException } from '@nestjs/common';
import { portal_contracts } from 'generated/prisma';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalContractService } from '@lib/portal-lib/konstructor';
import { CreatePortalContractDto } from '../dto/create-portal-contract.dto';
import { UpdatePortalContractDto } from '../dto/update-portal-contract.dto';

/**
 * Запись договоров портала (`portal_contracts`): создание (портал — по `domain`),
 * частичное обновление и удаление по id. Доменная логика — в
 * {@link PortalContractService} из `@lib/portal-lib/konstructor`.
 */
@Injectable()
export class ManagePortalContractUseCase {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalContractService: PortalContractService,
    ) {}

    async createByDomain(
        domain: string,
        dto: CreatePortalContractDto,
    ): Promise<portal_contracts> {
        const portalId = await this.resolvePortalId(domain);
        return this.portalContractService.create({
            portal_id: BigInt(portalId),
            contract_id: BigInt(dto.contract_id),
            portal_measure_id: BigInt(dto.portal_measure_id),
            bitrixfield_item_id: BigInt(dto.bitrixfield_item_id),
            title: dto.title,
            template: dto.template,
            order: dto.order,
            productName: dto.productName,
            description: dto.description,
        });
    }

    async update(
        id: number,
        dto: UpdatePortalContractDto,
    ): Promise<portal_contracts> {
        const data: Partial<portal_contracts> = {};
        if (dto.contract_id !== undefined)
            data.contract_id = BigInt(dto.contract_id);
        if (dto.portal_measure_id !== undefined)
            data.portal_measure_id = BigInt(dto.portal_measure_id);
        if (dto.bitrixfield_item_id !== undefined)
            data.bitrixfield_item_id = BigInt(dto.bitrixfield_item_id);
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.template !== undefined) data.template = dto.template;
        if (dto.order !== undefined) data.order = dto.order;
        if (dto.productName !== undefined) data.productName = dto.productName;
        if (dto.description !== undefined) data.description = dto.description;
        return this.portalContractService.update(id, data);
    }

    async remove(id: number): Promise<void> {
        await this.portalContractService.delete(id);
    }

    private async resolvePortalId(domain: string): Promise<number> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal with domain ${domain} not found`,
            );
        }
        return Number(portal.id);
    }
}
