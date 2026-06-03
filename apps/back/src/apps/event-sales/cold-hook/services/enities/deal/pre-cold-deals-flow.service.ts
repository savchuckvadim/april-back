/**
 *
 * Получает id компаний для которых сработал хук
 * для каждой закрывает ненжные сделки
 *  получает portal и bitrix из вне
 * не injactable вызывается через new
 */
import { BitrixService, IBXCompany, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { PortalDealColdCategoryService } from './portal-deal-cold-category.service';
import { EventColdCallEntityTargetFieldsModel } from '../entity/event-entity-fields.model';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';

export interface ICompanyBaseDeal {
    company: IBXCompany;
    baseDeal: IBXDeal | null;
}

export class PreColdDealFlowService {
    private portalDealCategoryService: PortalDealColdCategoryService;
    private fieldsService: EventColdCallEntityTargetFieldsModel;
    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
    ) {
        this.portalDealCategoryService = new PortalDealColdCategoryService(
            this.portal,
        );
        this.fieldsService = new EventColdCallEntityTargetFieldsModel(
            this.portal,
            EnumColdCallEntityType.DEAL,
        );
    }

    public async execute(companies: IBXCompany[]): Promise<ICompanyBaseDeal[]> {
        const deals = await this.getDealsForClose(companies.map(c => c.ID));
        const baseDealByCompany = this.selectLatestBaseDealsByCompany(deals);
        const preservedDealIds = new Set(
            Array.from(baseDealByCompany.values(), deal => deal.ID),
        );

        for (const deal of deals) {
            if (preservedDealIds.has(deal.ID)) {
                continue;
            }
            const nextStageForUpdtae = this.getNextStageForUpdtae(deal);
            if (!nextStageForUpdtae) {
                continue;
            }
            const batchKey = `upd_deal_pre_cold_close_${deal.ID}`;
            this.bitrix.batch.deal.update(batchKey, deal.ID, {
                STAGE_ID: nextStageForUpdtae,
            });
        }
        await this.bitrix.api.callBatchWithConcurrency(2);

        return companies.map(company => ({
            company: company,
            baseDeal: baseDealByCompany.get(Number(company.ID)) ?? null,
        }));
    }

    private selectLatestBaseDealsByCompany(
        deals: IBXDeal[],
    ): Map<number, IBXDeal> {
        const result = new Map<number, IBXDeal>();
        for (const deal of deals) {
            if (!this.isBaseCategoryDeal(deal.CATEGORY_ID)) {
                continue;
            }
            const companyId = Number(deal.COMPANY_ID);
            const current = result.get(companyId);
            if (current === undefined || deal.ID > current.ID) {
                result.set(companyId, deal);
            }
        }
        return result;
    }

    private async getDealsForClose(companyIds: number[]): Promise<IBXDeal[]> {
        const targetStages =
            this.portalDealCategoryService.getTargetDealStagesForClosePreCold();
        const selectFields = this.fieldsService.getBitrixIds();
        const dealsResponse = await this.bitrix.deal.all(
            {
                '=STAGE_ID': targetStages,
                '=COMPANY_ID': companyIds,
            },
            [
                'ID',
                'TITLE',
                'STAGE_ID',
                'CATEGORY_ID',
                'COMPANY_ID',
                ...selectFields,
            ],
        );
        return dealsResponse;
    }

    private getNextStageForUpdtae(deal: IBXDeal) {
        const currentCategoryBitrixId = deal.CATEGORY_ID;
        return this.portalDealCategoryService.getNoresultDealSageIdByCategoryBitrixId(
            currentCategoryBitrixId,
        );
    }

    private isBaseCategoryDeal(categoryId: string) {
        const baseCategory = this.portalDealCategoryService.getBaseCategory();
        return baseCategory?.bitrixId === categoryId;
    }
}
