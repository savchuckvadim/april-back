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
import {
    PriceEntity,
    PriceService,
    RegionEntity,
    renderSupplyTemplate,
    SupplyEntity,
    SupplyService,
} from '@lib/garant';
import {
    ComplectsDto,
    ContractsDto,
    InfoblockDto,
    InfoGroupsDto,
    KonstructorInitDataDto,
    MeasureInitDto,
    PriceInitDto,
    RegionInitDto,
    ServicesInitDto,
    SupplyInitDto,
} from './dto/response-init-data.dto';
import { ContractService } from '@lib/garant/contract/contract.service';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { ContractDto } from '../dto/contract.dto';
import { PortalContractEntity } from '@lib/garant/contract/portal-contract.entity';
import { CONTRACT_CODE } from '../document-generate/type/contract.type';
import { InitServicesService } from './services/init-services.service';
import { MeasureService } from '@lib/portal-lib/konstructor/measure/measure.service';
import { PortalMeasureService } from '@lib/portal-lib/konstructor/portal-measure/portal-measure.service';

export interface IKonstruktorInit {
    complects: IComplects | null;
    infoblocks: IInfoGroups[] | null;
    regions: RegionEntity[] | null;
    contracts: ContractsDto;
    supplies: SupplyInitDto[];
    prices: PriceInitDto[];
    services: ServicesInitDto;
    measures: MeasureInitDto[];
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
        private readonly priceService: PriceService,
        private readonly servicesService: InitServicesService,
        private readonly measureService: MeasureService,
        private readonly portalMeasureService: PortalMeasureService,
    ) {}

    async init(domain: string): Promise<KonstructorInitDataDto> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }
        const complects = await this.complect.get();
        const infoblocks = await this.infoblock.get();
        const portalId = Number(portal.id);
        const regions = await this.region.get(portalId);
        const contracts = await this.contract.findByPortalId(portalId);
        const supplies = await this.supplyService.findMany();
        const prices = await this.priceService.findMany();
        const services = await this.servicesService.get();
        const measures = await this.getMeasures(portalId);

        return {
            complects: this.getComplectsDto(
                complects || { prof: [], universal: [] },
            ),
            infoblocks: this.getInfogroups(infoblocks || []),
            regions: this.getRegions(regions || []),
            contracts: {
                current: contracts?.map(contract => Number(contract.id)) || [],
                items:
                    contracts?.map(contract => this.getContract(contract)) ||
                    [],
            },
            supplies: (supplies || []).map(supply => this.getSupply(supply)),
            prices: (prices || []).map(price => this.getPrice(price)),
            services,
            measures,
        };
    }

    private getSupply(supply: SupplyEntity): SupplyInitDto {
        return {
            id: Number(supply.id),
            name: supply.name,
            fullName: supply.fullName,
            shortName: supply.shortName,
            code: supply.code,
            type: supply.type,
            usersQuantity: supply.usersQuantity,
            coefficient: supply.coefficient,
            color: supply.color,
            description: supply.description,
            saleName_1: supply.saleName_1,
            saleName_2: supply.saleName_2,
            saleName_3: supply.saleName_3,
            // Тексты договоров остаются на бэке (резолв по code при генерации);
            // фронту — только то, что он показывает: подпись КП и сводка.
            quantityForKp: renderSupplyTemplate(
                supply.quantityForKp,
                supply.usersQuantity,
            ),
            contractPropSuppliesQuantity: renderSupplyTemplate(
                supply.contractPropSuppliesQuantity,
                supply.usersQuantity,
            ),
        };
    }

    /**
     * Меры (ед. изм.) портала: справочник measures + bitrixId из portal_measure.
     * Нужны productRows сделки и КП; раньше жили только вложенно в contracts.
     */
    private async getMeasures(portalId: number): Promise<MeasureInitDto[]> {
        const [measures, portalMeasures] = await Promise.all([
            this.measureService.findMany(),
            this.portalMeasureService.findByPortalId(portalId),
        ]);
        return measures.map(measure => {
            const portalMeasure = portalMeasures.find(
                item => item.measure_id === measure.id,
            );
            return {
                id: Number(measure.id),
                code: measure.code,
                type: measure.type,
                name: portalMeasure?.name || measure.name,
                shortName: portalMeasure?.shortName || measure.shortName,
                fullName: portalMeasure?.fullName || measure.fullName,
                bitrixId: portalMeasure?.bitrixId ?? null,
                portalMeasureId: portalMeasure
                    ? Number(portalMeasure.id)
                    : null,
            };
        });
    }

    private getPrice(price: PriceEntity): PriceInitDto {
        return {
            id: Number(price.id),
            code: price.code,
            value: price.value,
            isSpecial: price.isSpecial,
            discount: price.discount,
            region_type: price.region_type,
            supply_type: price.supply_type,
            supply_code: price.supply_code,
            complect_code: price.complect_code,
            garant_package_code: price.garant_package_code,
        };
    }
    private getContract(contract: PortalContractEntity): ContractDto {
        const code =
            (contract.contract?.code as CONTRACT_CODE) ||
            (CONTRACT_CODE.INTERNET as CONTRACT_CODE);
        return {
            id: Number(contract.id),
            contract: {
                id: Number(contract.contract?.id),
                name: contract.contract?.name || '',
                shortName: contract.portal_measure?.shortName || '',
                fullName: contract.portal_measure?.fullName || '',
                created_at: contract.contract?.created_at
                    ? contract.contract?.created_at.toISOString()
                    : '',
                updated_at: contract.contract?.updated_at
                    ? contract.contract?.updated_at.toISOString()
                    : null,
            },
            code: code,
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
                created_at: contract.portal_measure?.created_at
                    ? contract.portal_measure?.created_at.toISOString()
                    : '',
                updated_at: contract.portal_measure?.updated_at
                    ? contract.portal_measure?.updated_at.toISOString()
                    : '',
                measure: contract.portal_measure?.measure || null,
            },
            // Код единицы для productRows Bitrix — bitrixId портальной меры;
            // measures.code — строковый код «для APP», его Number() давал 0.
            measureCode: Number(contract.portal_measure?.bitrixId) || 0,
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
            code: region.code,
            // каждый регион в составе комплекта весит 0.5 (колонки в БД нет)
            weight: 0.5,
            number: region.number,
            title: region.title,
            infoblock: region.infoblock,
            abs: region.abs,
            tax: region.tax,
            tax_abs: region.tax_abs,
        } as RegionInitDto;
    }
}
