import { PortalModel } from '@lib/portal/services/portal.model';
import { PortalDealColdCategoryService } from './portal-deal-cold-category.service';
import { PbxDealCategoryCodeEnum } from '@lib/portal/services/types/deals/portal.deal.type';
import {
    IPCategory,
    IStage,
} from '@lib/portal/interfaces/portal.interface';
/**
 * Возвращает id полей в заисимости от категории и события
 * в данном случае событие одно - xo
 * категории которые интересуют две
 * для base - стадия Холодные
 * для cold - стадия запланирован
 * еще может появиться tmc
 * отдаем стадии в формате пригодном для битрикс C{categoryId}:{}
 *
 */
export enum XoTargeStageCodesEnum {
    BASE = 'sales_cold',
    XO = 'cold_plan',
    TMC = 'sales_tmc_new',
}
export interface IColdTargeStageData {
    stageId: string;
    categoryId: string;
}
export class ColdPortalDealModel {
    private readonly portalDealCategoryService: PortalDealColdCategoryService;
    constructor(portal: PortalModel) {
        this.portalDealCategoryService = new PortalDealColdCategoryService(
            portal,
        );
    }
    public getTargetStageBitrixId(
        type: PbxDealCategoryCodeEnum,
    ): IColdTargeStageData | undefined {
        if (
            type === PbxDealCategoryCodeEnum.sales_base ||
            type === PbxDealCategoryCodeEnum.sales_xo
        ) {
            const category = this.getCategory(type);
            if (!category) {
                return undefined;
            }
            const stage = this.getTargetStageBitrixIdByType(category, type);

            if (!stage) {
                return undefined;
            }
            const stageId = this.getStageBitrixId(category, stage);
            const categoryId = category.bitrixId;

            return { stageId, categoryId };
        }
        return undefined;
    }
    private getCategory(type: PbxDealCategoryCodeEnum) {
        switch (type) {
            case PbxDealCategoryCodeEnum.sales_base:
                return this.portalDealCategoryService.getBaseCategory();
            case PbxDealCategoryCodeEnum.sales_xo:
                return this.portalDealCategoryService.getXoCategory();
            default:
                return undefined;
        }
    }

    private getTargetStageBitrixIdByType(
        category: IPCategory,
        type: PbxDealCategoryCodeEnum,
    ): IStage | undefined {
        switch (type) {
            case PbxDealCategoryCodeEnum.sales_base:
                return this.getBaseTargetStage(category);
            case PbxDealCategoryCodeEnum.sales_xo:
                return this.getXoTargetStage(category);
            default:
                return undefined;
        }
    }

    private getXoTargetStage(category: IPCategory): IStage | undefined {
        const result = category.stages.find(
            (stage: IStage) =>
                stage.code === (XoTargeStageCodesEnum.XO as string),
        );

        return result;
    }

    private getBaseTargetStage(category: IPCategory): IStage | undefined {
        return category.stages.find(
            (stage: IStage) =>
                stage.code === (XoTargeStageCodesEnum.BASE as string),
        );
    }

    private getStageBitrixId(category: IPCategory, stage: IStage) {
        const categoryId = category.bitrixId;
        const stageId = stage.bitrixId;
        return `C${categoryId}:${stageId}`;
    }
}
