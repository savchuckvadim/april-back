import { Injectable } from '@nestjs/common';
import {
    IComplects,
    InitComplectService,
} from './services/init-complect.service';
import {
    IInfoblock,
    IInfoGroups,
    InitInfoblockService,
} from './services/init-infoblock.service';
import { InitRegionService } from './services/init.region.service';
import { RegionEntity, SupplyService } from '@/modules/garant';
import { ComplectsDto, ContractsDto, InfoblockDto, InfoGroupsDto, KonstructorInitDataDto, RegionInitDto } from './dto/response-init-data.dto';
import { ContractService } from '@/modules/garant/contract/contract.service';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { ContractDto } from '../dto/contract.dto';
import { PortalContractEntity } from '@/modules/garant/contract/portal-contract.entity';


export interface IKonstruktorInit {
    complects: IComplects | null;
    infoblocks: IInfoGroups[] | null;
    regions: RegionEntity[] | null;
    contracts: ContractsDto;
}
@Injectable()
export class KonstructorInitUseCase {
    constructor(
        private readonly complect: InitComplectService,
        private readonly infoblock: InitInfoblockService,
        private readonly region: InitRegionService,
        private readonly contract: ContractService,
        private readonly portalStoreService: PortalStoreService,
        private readonly supplyService: SupplyService,
    ) { }

    async init(domain: string): Promise<KonstructorInitDataDto> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }
        const complects = await this.complect.get();
        const infoblocks = await this.infoblock.get();
        const regions = await this.region.get();
        const contracts = await this.contract.findByPortalId(Number(portal?.id));
        const supplies = await this.supplyService.findMany();

        return {
            complects: this.getComplectsDto(complects || { prof: [], universal: [] }),
            infoblocks: this.getInfogroups(infoblocks || []),
            regions: this.getRegions(regions || []),
            contracts: {
                current: contracts?.map(contract => Number(contract.id)) || [],
                items: contracts?.map(contract => this.getContract(contract)) || [],
            },
        };
    }
    private getContract(contract: PortalContractEntity): ContractDto {
        return {
            id: Number(contract.id),
            contract: {
                id: Number(contract.contract?.id),
                name: contract.contract?.name || '',
                shortName: contract.portal_measure?.shortName || '',
                fullName: contract.portal_measure?.fullName || '',
                created_at: contract.contract?.created_at ? contract.contract?.created_at.toISOString() : '',
                updated_at: contract.contract?.updated_at ? contract.contract?.updated_at.toISOString() : null,
            },
            code: contract.contract?.code || '',
            shortName: contract.portal_measure?.shortName || '',
            number: contract.order || 0,
            aprilName: contract.contract?.name || '',
            bitrixName: contract.contract?.name || '',
            discount: contract.contract?.discount || 0,
            itemId: Number(contract.bitrixfield_item_id) || 0,
            prepayment: contract.contract?.prepayment || 0,
            order: contract.order || 0,
            portalMeasure: {
                id: Number(contract.portal_measure?.id),
                measure_id: Number(contract.portal_measure?.measure_id),
                portal_id: Number(contract.portal_measure?.portal_id),
                bitrixId: contract.portal_measure?.bitrixId || '',
                name: contract.portal_measure?.name || '',
                shortName: contract.portal_measure?.shortName || '',
                fullName: contract.portal_measure?.fullName || '',
                created_at: contract.portal_measure?.created_at ? contract.portal_measure?.created_at.toISOString() : '',
                updated_at: contract.portal_measure?.updated_at ? contract.portal_measure?.updated_at.toISOString() : '',
                measure: contract.portal_measure?.measure || null,
            },
            measureCode: Number(contract.portal_measure?.measure?.code) || 0,
            measureFullName: contract.portal_measure?.fullName || '',
            measureId: Number(contract.portal_measure?.id) || 0,
            measureName: contract.portal_measure?.name || '',
            measureNumber: Number(contract.portal_measure?.measure_id) || 0,
        };
    }
    private getComplectsDto(complects: IComplects): ComplectsDto {
        return {
            prof: complects.prof.map(complect => ({
                ...complect,
                id: Number(complect.id),
            })),
            universal: complects.universal.map(complect => ({
                ...complect,
                id: Number(complect.id),
            })),
        };
    }

    private getInfogroups(groups: IInfoGroups[]): InfoGroupsDto[] {
        return groups.map(group => this.getInfogroup(group));
    }

    private getInfogroup(group: IInfoGroups): InfoGroupsDto {
        return {
            id: group.id,
            code: group.code,
            groupName: group.groupName,
            type: group.type,
            productType: group.productType,
            value: this.getInfoblocks(group.value),
        } as InfoGroupsDto;
    }


    private getInfoblocks(infoblocks: IInfoblock[]): InfoblockDto[] {
        return infoblocks.map(infoblock => this.getInfoblock(infoblock));
    }
    private getInfoblock(infoblock: IInfoblock): InfoblockDto {
        return {
            id: infoblock.id,
            name: infoblock.name,
            code: infoblock.code,
            weight: infoblock.weight,
            infogroupId: infoblock.infogroupId,
            infohroupCode: infoblock.infohroupCode,
            infohroupName: infoblock.infohroupName,
            shortDescription: infoblock.shortDescription,
            description: infoblock.description,
            descriptionForSale: infoblock.descriptionForSale,
            parent: infoblock.parent,
            children: infoblock.children,
            isSet: infoblock.isSet,
            isFree: infoblock.isFree,
            isLa: infoblock.isLa,
        } as InfoblockDto;
    }
    private getRegions(regions: RegionEntity[]): RegionInitDto[] {
        return regions.map(region => this.getRegion(region));
    }
    private getRegion(region: RegionEntity): RegionInitDto {
        return {
            id: region.id,
            name: region.code,
            code: region.code,

            number: region.number,
            title: region.title,
            infoblock: region.infoblock,
            abs: region.abs,
            tax: region.tax,
            tax_abs: region.tax_abs,
        } as RegionInitDto;
    }
}
