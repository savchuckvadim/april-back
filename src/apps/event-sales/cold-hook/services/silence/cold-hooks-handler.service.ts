import { PBXService } from '@/modules/pbx/pbx.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { IColdHookSilenceHandlerData } from '../../type/cold-hook-silence.interface';
import { EnumColdCallEntityType } from '../../dto/cold.dto';
import { ColdCallUseCase } from '../../use-cases/cold-call.use-case';
import { BitrixService, IBXCompany, IBXDeal } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { getErrorDetails } from '@/shared';
import { EventColdCallEntityTargetFieldsModel } from '../enities/entity/event-entity-fields.model';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@/modules/portal/services/types/deals/portal.deal.type';
import {
    IPCategory,
    IStage,
} from '@/modules/portal/interfaces/portal.interface';

/**
 * Обрабатывает множество хуков
 *
 */
@Injectable()
export class ColdHooksHandlerService {
    private readonly logger = new Logger(ColdHooksHandlerService.name);

    constructor(private readonly pbx: PBXService) {
        this.logger.log('Cold Hooks Silence Handler initialized');
    }

    async handleHooks(
        domain: string,
        hooks: IColdHookSilenceHandlerData['collected'],
    ): Promise<void> {
        try {
            this.logger.log('hooks');
            if (!hooks || Object.keys(hooks).length === 0) {
                this.logger.log('No Cold Hooks to create');
                return;
            }
            const { bitrix, portal, PortalModel } = await this.pbx.init(domain);
            // const tergetFieldsService =
            //     new EventColdCallEntityTargetFieldsModel(
            //         PortalModel,
            //         EnumColdCallEntityType.COMPANY,
            //     );
            // const selectFields = tergetFieldsService.getBitrixIds();
            // const targetCategories = this.getTargetPDealCategories(PortalModel);

            const select = [
                // ...selectFields,
                'ID',
                'TITLE',
                // 'STAGE_SEMANTIC_ID',
                // 'COMPANY_ID',
                // 'CATEGORY_ID',
            ];
            // this.logger.log(select);
            const useCase = new ColdCallUseCase(bitrix, PortalModel);

            const { companies, companiesIds } = await this.getCompanies(
                bitrix,
                hooks,
                select,
            );
            await this.getOpenDealsByCompanies(
                bitrix,
                PortalModel,
                companiesIds,
            );
            //todo переделать добавить сделки тоже если запускалось из сделко
            // const deals = await bitrix.deal.getList({
            //     filter: { ID: { IN: dealsIds } },
            //     select: ['ID', 'TITLE'],
            // });

            if (portal) {
                this.logger.log(domain);

                for (const [_, raw] of Object.entries(hooks)) {
                    const currentCompany: IBXCompany = companies.find(
                        (company: IBXCompany) =>
                            Number(company.ID) === Number(raw.entityId),
                    ) as IBXCompany;

                    await useCase.flow(raw, currentCompany, null, null);
                }

                const result = await bitrix.api.callBatchWithConcurrency(2);
                this.logger.log(`Batch result: ${JSON.stringify(result)}`);
                return;
            } else {
                throw new HttpException(
                    'Cold hook portal notfound for domain: ' + domain,
                    HttpStatus.BAD_REQUEST,
                );
            }
        } catch (err) {
            const { message, stack } = getErrorDetails(err);
            this.logger.error(
                'Error in Cold Hooks Silence Handler Service',
                message,
            );
            this.logger.error(stack);
        }
    }
    private async getOpenDealsByCompanies(
        bitrix: BitrixService,
        portal: PortalModel,
        companiesIds: number[],
    ) {
        const targetCategories = this.getTargetPDealCategories(portal);
        const targetStages = this.getTargetDealStages(targetCategories);
        const dealsResponse = await bitrix.deal.all(
            {
                '=STAGE_ID': targetStages,
                '=COMPANY_ID': companiesIds,
            },
            ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID'],
        );
        return dealsResponse;
    }
    private getTargetPDealCategories(
        portal: PortalModel,
    ): Record<string, IPCategory> {
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
    private getTargetDealStages(
        categories: Record<string, IPCategory>,
    ): string[] {
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

    private async getCompanies(
        bitrix: BitrixService,
        hooks: IColdHookSilenceHandlerData['collected'],
        select?: string[],
    ): Promise<{
        companies: IBXCompany[];
        companiesIds: number[];
        baseDeals: IBXDeal[];
    }> {
        const companiesIds: number[] = [];
        const dealsIds: number[] = [];
        let companies: IBXCompany[] = [];
        let baseDeals: IBXDeal[] = [];
        for (const key in hooks) {
            const hook = hooks[key];
            if (hook.entityType === EnumColdCallEntityType.COMPANY) {
                companiesIds.push(Number(hook.entityId));
            } else if (hook.entityType === EnumColdCallEntityType.DEAL) {
                dealsIds.push(Number(hook.entityId));
            }
        }
        this.logger.log('deals', dealsIds);
        if (dealsIds && dealsIds.length) {
            baseDeals = await this.getEntitiesByEntitiesIds<IBXDeal>(
                EnumColdCallEntityType.DEAL,
                bitrix,
                dealsIds,
            );
            console.log('deals');
            baseDeals.map(deal => {
                companiesIds.push(Number(deal.COMPANY_ID));
            });
        }
        companies = await this.getEntitiesByEntitiesIds<IBXCompany>(
            EnumColdCallEntityType.COMPANY,
            bitrix,
            companiesIds,
        );
        this.logger.log('companiesIds');
        this.logger.log(companiesIds);

        // this.logger.log(companies)
        return { companies, companiesIds, baseDeals };
    }

    private async getEntitiesByEntitiesIds<T extends IBXCompany | IBXDeal>(
        entityType: EnumColdCallEntityType,
        bitrix: BitrixService,
        ids: number[],
    ): Promise<T[]> {
        ids.map(id => {
            const key = `pre_xo_${bitrix.api.domain}_${entityType}_${id}`;
            bitrix.batch[entityType].get(key, id);
        });
        const result = await bitrix.api.callBatchWithConcurrency(1);
        const entities = this.prepareBatchResults<T>(result);
        return entities;
    }

    private prepareBatchResults<T extends IBXCompany | IBXDeal>(
        results: IBitrixBatchResponseResult[],
    ): T[] {
        const entities: T[] = [];
        for (const chunk of results) {
            for (const key in chunk.result) {
                const entity = chunk.result[key] as T;
                entities.push(entity);
            }
        }
        return entities;
    }
}
