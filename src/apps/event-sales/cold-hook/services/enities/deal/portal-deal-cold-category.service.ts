import { Logger } from '@nestjs/common';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@/modules/portal/services/types/deals/portal.deal.type';
import {
    IPCategory,
    IStage,
} from '@/modules/portal/interfaces/portal.interface';

/**
 * Работает с данными Portal Deal из db
 *
 * возвращает нужные категории и стадии все или по кодам
 * не injectable вызывается через new, так как портал при разныхх вызовах может быть разным
 *
 *
 */

export class PortalDealColdCategoryService {
    private readonly logger = new Logger(PortalDealColdCategoryService.name);

    constructor(private readonly portal: PortalModel) {
        this.logger.log('Portal Deal Cold Category Service initialized');
    }

    public getTargetPDealCategories(): Record<string, IPCategory> {
        const portal = this.portal;
        const tmcCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.tmc_base,
        );
        const baseCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        const presentationCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        const xoCategory = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_xo,
        );
        const result: Record<string, IPCategory> = {};
        if (tmcCategory) {
            result[tmcCategory.code] = tmcCategory;
        }
        if (baseCategory) {
            result[baseCategory.code] = baseCategory;
        }
        if (presentationCategory) {
            result[presentationCategory.code] = presentationCategory;
        }
        if (xoCategory) {
            result[xoCategory.code] = xoCategory;
        }
        return result;
    }
    public getTargetDealStagesForClosePreCold(): string[] {
        const categories = this.getTargetPDealCategories();
        const stages: string[] = [];
        const isNotTargetStage = (code: string): boolean => {
            return (
                code.includes('fail') ||
                code.includes('noresult') ||
                code.includes('double') ||
                code.includes('success')
            );
        };
        Object.values(categories).forEach((category: IPCategory) => {
            category.stages.forEach((stage: IStage) => {
                if (!isNotTargetStage(stage.code)) {
                    const stageBitrixId = `C${category.bitrixId}:${stage.bitrixId}`;
                    stages.push(stageBitrixId);
                }
            });
        });
        return stages;
    }

    public getNoresultDealSageIdByCategoryBitrixId(categoryBitrixId: string) {
        const categories = this.portal.getDealCategories();
        const category = categories.find(c => c.bitrixId === categoryBitrixId);

        if (!category) {
            return undefined;
        }
        this.logger.log(` category ${category.title}`);

        const targetStage = category.stages.find(
            s => s.code.includes('double') || s.code.includes('noresult'),
        );

        if (!targetStage) {
            this.logger.error(
                `No target stage found for category ${categoryBitrixId}`,
            );
            return undefined;
        }

        const stageBitrixId = `C${category.bitrixId}:${targetStage?.bitrixId}`;
        this.logger.log(
            `Noresult stage for category ${categoryBitrixId}: ${stageBitrixId}`,
        );
        return stageBitrixId;
    }

    public getBaseCategory() {
        return this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
    }

    public getXoCategory() {
        return this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_xo,
        );
    }
}
