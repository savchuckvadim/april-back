import { Injectable } from '@nestjs/common';
import { BitrixGeneralService } from '../general/bitrix-general.service';

interface DealCategory {
    code: string;
    bitrixId: number;
    stages: DealStage[];
}

interface DealStage {
    code: string;
    bitrixId: string;
    order: number;
}

export interface Deal {
    ID: string;
    CATEGORY_ID: string;
    STAGE_ID: string;
    COMPANY_ID?: string;
    LEAD_ID?: string;
    ASSIGNED_BY_ID: string;
    TITLE?: string;
    UF_CRM_TO_BASE_SALES?: number;
    UF_CRM_TO_PRESENTATION_SALES?: number;
    UF_CRM_PRES_COMMENTS?: string;
    UF_CRM_LAST_PRES_DONE_RESPONSIBLE?: number;
    UF_CRM_MANAGER_OP?: number;
}

interface PortalDeal {
    categories: DealCategory[];
}

interface EventOrder {
    code: string;
    order: number;
    suphicks: string;
}

@Injectable()
export class BitrixDealService {
    constructor(private readonly bitrixGeneralService: BitrixGeneralService) {}

    async getDealId(
        hook: string,
        leadId: number | null,
        companyId: number | null,
        userId: number,
        portalDeal: PortalDeal,
        currentCategoryData: DealCategory,
    ): Promise<Deal | null> {
        let currentDeal: Deal | null = null;

        try {
            const method = '/crm.deal.list.json';
            const url = hook + method;
            const currentCategoryBtxId = currentCategoryData.bitrixId;

            let data: any = {};

            if (companyId) {
                data = {
                    filter: {
                        '=CATEGORY_ID': currentCategoryBtxId,
                        COMPANY_ID: companyId,
                        ASSIGNED_BY_ID: userId,
                        '!=STAGE_ID': [`C${currentCategoryBtxId}:WON`],
                    },
                    select: ['ID', 'CATEGORY_ID', 'STAGE_ID'],
                };
            }

            if (leadId) {
                data = {
                    filter: {
                        ASSIGNED_BY_ID: userId,
                        LEAD_ID: leadId,
                        CATEGORY_ID: currentCategoryBtxId,
                        '!=STAGE_ID': [`C${currentCategoryBtxId}:WON`],
                    },
                    select: ['ID', 'CATEGORY_ID', 'STAGE_ID'],
                };
            }

            const response = await this.bitrixGeneralService.makeRequest(
                url,
                data,
            );
            currentDeal = response?.items?.[0] || null;

            if (Array.isArray(currentDeal)) {
                currentDeal = currentDeal[0];
            }

            return currentDeal;
        } catch (error) {
            console.error('Error in getDealId:', error);
            return currentDeal;
        }
    }

    getTargetCategoryData(
        portalDealData: PortalDeal,
        currentDepartamentType: string,
        eventType: string,
        eventAction: string,
    ): DealCategory[] {
        const resultCategoryDatas: DealCategory[] = [];
        const categoryPrephicks: string[] = [];

        if (currentDepartamentType === 'sales') {
            if (
                eventType === 'document' ||
                eventType === 'supply' ||
                eventAction === 'plan' ||
                (eventAction === 'done' && eventType === 'presentation') ||
                eventAction === 'fail' ||
                eventAction === 'success'
            ) {
                categoryPrephicks.push(`${currentDepartamentType}_base`);
            }

            if (eventType === 'xo') {
                categoryPrephicks.push(`${currentDepartamentType}_xo`);
            } else if (eventType === 'presentation') {
                categoryPrephicks.push(
                    `${currentDepartamentType}_presentation`,
                );
            }
        } else if (currentDepartamentType === 'tmc') {
            categoryPrephicks.push(`${currentDepartamentType}_base`);
        }

        if (eventType === 'document') {
            categoryPrephicks.push('sales_base');
        }

        if (portalDealData.categories) {
            for (const category of portalDealData.categories) {
                if (categoryPrephicks.includes(category.code)) {
                    resultCategoryDatas.push(category);
                }
            }
        }

        return resultCategoryDatas;
    }

    getTargetStage(
        currentCategoryData: DealCategory,
        group: string,
        eventType: string,
        eventAction: string,
        isResult: boolean,
    ): string | null {
        let targetStageBtxId: string | null = null;
        let stageSuphicks = 'plan';
        let stagePrephicks = 'warm';

        if (currentCategoryData.code === 'sales_base') {
            stagePrephicks = 'sales';

            if (eventAction === 'fail' || eventAction === 'success') {
                stageSuphicks = eventAction;
            } else {
                if (eventType === 'xo') {
                    stageSuphicks = 'cold';
                } else if (eventType === 'warm') {
                    stageSuphicks = 'warm';
                } else if (eventType === 'presentation') {
                    stageSuphicks = 'pres';
                } else if (eventType === 'hot') {
                    stageSuphicks = 'in_progress';
                } else if (eventType === 'moneyAwait') {
                    stageSuphicks = 'money_await';
                }
            }
        } else {
            if (eventAction === 'done' || eventAction === 'success') {
                stageSuphicks = 'success';
                stageSuphicks = 'pending';
            } else if (eventAction === 'fail') {
                stageSuphicks = 'fail';

                if (!isResult) {
                    stageSuphicks = 'noresult';
                }
            }

            if (eventType === 'xo') {
                stagePrephicks = 'cold';
            } else if (eventType === 'presentation') {
                stagePrephicks = 'spres';
            }

            if (group === 'tmc') {
                if (eventType === 'xo') {
                    stageSuphicks = 'new';
                }

                if (eventAction === 'plan' && eventType === 'presentation') {
                    stageSuphicks = 'pres_in_progress';
                }
                stagePrephicks = 'sales_tmc';
                if (eventAction === 'plan' && eventType === 'presentation') {
                    stageSuphicks = 'pres_in_progress';
                }
                if (eventAction === 'done' && eventType === 'presentation') {
                    stageSuphicks = 'success';
                }
                if (eventAction === 'fail' && eventType === 'presentation') {
                    stageSuphicks = 'noresult';
                }
            }
        }

        if (eventType === 'document') {
            stagePrephicks = 'sales';
            stageSuphicks = 'offer_create';
        }

        if (eventType === 'supply') {
            stagePrephicks = 'sales';
            stageSuphicks = 'supply';
        }

        if (currentCategoryData.stages) {
            for (const stage of currentCategoryData.stages) {
                if (stage.code === `${stagePrephicks}_${stageSuphicks}`) {
                    targetStageBtxId = stage.bitrixId;
                }
            }
        }

        return targetStageBtxId;
    }

    async getDeal(hook: string, params: { id: number }): Promise<Deal | null> {
        try {
            const method = '/crm.deal.get.json';
            const url = hook + method;
            const response = await this.bitrixGeneralService.makeRequest(url, {
                id: params.id,
            });
            return response?.result || null;
        } catch (error) {
            console.error('Error in getDeal:', error);
            return null;
        }
    }

    async updateDeal(
        hook: string,
        dealId: number,
        fields: Partial<Deal>,
    ): Promise<any> {
        try {
            const method = '/crm.deal.update.json';
            const url = hook + method;
            const data = {
                id: dealId,
                fields: fields,
            };
            const response = await this.bitrixGeneralService.makeRequest(
                url,
                data,
            );
            return response?.result || null;
        } catch (error) {
            console.error('Error in updateDeal:', error);
            return null;
        }
    }

    async setDeal(
        hook: string,
        fields: Partial<Deal>,
        category?: DealCategory,
    ): Promise<string | null> {
        try {
            const method = '/crm.deal.add.json';
            const url = hook + method;
            const data = {
                fields: {
                    ...fields,
                },
            };
            if (category) {
                data.fields = {
                    ...fields,
                    CATEGORY_ID: category.bitrixId.toString(),
                };
            }
            const response = await this.bitrixGeneralService.makeRequest(
                url,
                data,
            );
            return response?.result || null;
        } catch (error) {
            console.error('Error in setDeal:', error);
            return null;
        }
    }

    getBaseDealFromCurrentBtxDeals(
        portalDealData: PortalDeal,
        currentBtxDeals: Deal[],
    ): Deal[] {
        const result: Deal[] = [];
        let currentBtxDeal: Deal | null = null;

        for (const btxDeal of currentBtxDeals) {
            if (portalDealData.categories) {
                for (const category of portalDealData.categories) {
                    if (
                        category.code === 'sales_base' &&
                        Number(btxDeal.CATEGORY_ID) === category.bitrixId
                    ) {
                        currentBtxDeal = btxDeal;
                        result.push(currentBtxDeal);
                    }
                }
            }
        }

        return result;
    }

    getSaleBaseTargetStage(
        currentCategoryData: DealCategory,
        currentStageOrder: string | null,
        planEventType: string | null,
        reportEventType: string,
        planEventAction: string | null,
        reportEventAction: string | null,
        isResult: boolean,
        isUnplanned: boolean,
        isSuccess: boolean,
        isFail: boolean,
    ): string | null {
        let targetStageBtxId: string | null = null;
        let stageSuphicks = 'plan';
        let stagePrephicks = 'sales';

        const eventOrders: EventOrder[] = [
            {
                code: 'xo',
                order: 0,
                suphicks: 'cold',
            },
            {
                code: 'warm',
                order: 1,
                suphicks: 'warm',
            },
            {
                code: 'presentation',
                order: 2,
                suphicks: 'pres',
            },
            {
                code: 'document',
                order: 3,
                suphicks: 'offer_create',
            },
            {
                code: 'hot',
                order: 4,
                suphicks: 'in_progress',
            },
            {
                code: 'moneyAwait',
                order: 5,
                suphicks: 'money_await',
            },
            {
                code: 'supply',
                order: 6,
                suphicks: 'supply',
            },
        ];

        let planOrder = 0;
        let reportOrder = 0;

        const codesToFilter: string[] = [];

        if (planEventType) {
            codesToFilter.push(planEventType);
        }
        if (reportEventType) {
            codesToFilter.push(reportEventType);
        }
        if (currentStageOrder) {
            codesToFilter.push(currentStageOrder);
        }
        if (isUnplanned) {
            codesToFilter.push('presentation');
        }

        const filtered = eventOrders.filter(item =>
            codesToFilter.includes(item.code),
        );
        const currentOrderData = filtered.reduce(
            (carry, item) =>
                carry === null || item.order > carry.order ? item : carry,
            null as EventOrder | null,
        );

        if (currentOrderData) {
            stageSuphicks = currentOrderData.suphicks;
        }

        if (isSuccess) {
            stageSuphicks = 'success';
        } else if (isFail) {
            stageSuphicks = 'fail';
            if (!isResult) {
                stageSuphicks = 'noresult';
            }
        }

        if (currentCategoryData.stages) {
            for (const stage of currentCategoryData.stages) {
                if (stage.code === `${stagePrephicks}_${stageSuphicks}`) {
                    targetStageBtxId = stage.bitrixId;
                }
            }
        }

        return targetStageBtxId;
    }

    getEventOrderFromCurrentBaseDeal(
        currentBtxDeal: Deal | null,
        currentCategoryData: DealCategory,
    ): string | null {
        let targetStageBtxId: string | null = null;
        let stageSuphicks = 'plan';
        let stagePrephicks = 'sales';

        const eventOrders: EventOrder[] = [
            {
                code: 'xo',
                order: 0,
                suphicks: 'cold',
            },
            {
                code: 'warm',
                order: 1,
                suphicks: 'warm',
            },
            {
                code: 'presentation',
                order: 2,
                suphicks: 'pres',
            },
            {
                code: 'document',
                order: 3,
                suphicks: 'offer_create',
            },
            {
                code: 'hot',
                order: 4,
                suphicks: 'in_progress',
            },
            {
                code: 'moneyAwait',
                order: 5,
                suphicks: 'money_await',
            },
            {
                code: 'supply',
                order: 6,
                suphicks: 'supply',
            },
        ];

        let currentEventOrder: string | null = null;

        if (currentBtxDeal && currentBtxDeal.STAGE_ID) {
            for (const stage of currentCategoryData.stages) {
                if (
                    `C${currentCategoryData.bitrixId}:${stage.bitrixId}` ===
                    currentBtxDeal.STAGE_ID
                ) {
                    for (const eventOrder of eventOrders) {
                        if (
                            `${stagePrephicks}_${eventOrder.suphicks}` ===
                            stage.code
                        ) {
                            currentEventOrder = eventOrder.code;
                        }
                    }
                }
            }
        }

        return currentEventOrder;
    }

    getTMCTargetStage(
        currentCategoryData: DealCategory,
        currentStageOrder: string | null,
        planEventType: string | null,
        reportEventType: string,
        isResult: boolean,
        isSuccess: boolean,
        isFail: boolean,
        isExpired: boolean,
    ): string | null {
        let stageSuphicks = 'plan';
        let stagePrephicks = 'sales_tmc';
        let targetStageBtxId: string | null = null;

        const eventOrders: EventOrder[] = [
            {
                code: 'warm',
                order: 1,
                suphicks: 'plan',
            },
            {
                code: 'document',
                order: 3,
                suphicks: 'plan',
            },
            {
                code: 'hot',
                order: 4,
                suphicks: 'plan',
            },
            {
                code: 'moneyAwait',
                order: 6,
                suphicks: 'plan',
            },
            {
                code: 'presentation',
                order: 8,
                suphicks: 'pres_in_progress',
            },
            {
                code: 'success',
                order: 9,
                suphicks: 'success',
            },
            {
                code: 'fail',
                order: 10,
                suphicks: 'fail',
            },
        ];

        if (isExpired) {
            eventOrders.push({
                code: 'pending',
                order: 7,
                suphicks: 'pending',
            });
        } else {
            eventOrders.push({
                code: 'pending',
                order: 0,
                suphicks: 'pending',
            });
        }

        const codesToFilter: string[] = [];
        if (planEventType) {
            codesToFilter.push(planEventType, reportEventType);
        } else {
            codesToFilter.push(reportEventType);
        }

        if (currentStageOrder) {
            codesToFilter.push(currentStageOrder);
        }

        if (isExpired) {
            codesToFilter.push('pending');
        }

        const filtered = eventOrders.filter(item =>
            codesToFilter.includes(item.code),
        );
        const currentOrderData = filtered.reduce(
            (carry, item) =>
                carry === null || item.order > carry.order ? item : carry,
            null as EventOrder | null,
        );

        if (currentOrderData) {
            stageSuphicks = currentOrderData.suphicks;
        }

        if (isFail) {
            stageSuphicks = 'fail';
            if (!isResult) {
                stageSuphicks = 'noresult';
            }
        }

        if (isSuccess) {
            stageSuphicks = 'success';
        }

        if (currentCategoryData.stages) {
            for (const stage of currentCategoryData.stages) {
                if (stage.code === `${stagePrephicks}_${stageSuphicks}`) {
                    targetStageBtxId = stage.bitrixId;
                }
            }
        }

        return targetStageBtxId;
    }

    getEventOrderFromCurrentTMCDeal(
        currentBtxDeal: Deal | null,
        currentCategoryData: DealCategory,
    ): string | null {
        let stageSuphicks = 'plan';
        let stagePrephicks = 'sales_tmc';
        let currentEventOrder: string | null = null;

        const eventOrders: EventOrder[] = [
            {
                code: 'warm',
                order: 1,
                suphicks: 'plan',
            },
            {
                code: 'document',
                order: 3,
                suphicks: 'plan',
            },
            {
                code: 'hot',
                order: 4,
                suphicks: 'plan',
            },
            {
                code: 'moneyAwait',
                order: 6,
                suphicks: 'plan',
            },
            {
                code: 'pending',
                order: 7,
                suphicks: 'pending',
            },
            {
                code: 'presentation',
                order: 8,
                suphicks: 'pres_in_progress',
            },
            {
                code: 'success',
                order: 9,
                suphicks: 'success',
            },
            {
                code: 'fail',
                order: 10,
                suphicks: 'fail',
            },
        ];

        if (currentBtxDeal && currentBtxDeal.STAGE_ID) {
            for (const stage of currentCategoryData.stages) {
                if (
                    `C${currentCategoryData.bitrixId}:${stage.bitrixId}` ===
                    currentBtxDeal.STAGE_ID
                ) {
                    for (const eventOrder of eventOrders) {
                        if (
                            `${stagePrephicks}_${eventOrder.suphicks}` ===
                            stage.code
                        ) {
                            currentEventOrder = eventOrder.code;
                        }
                    }
                }
            }
        }

        return currentEventOrder;
    }

    getXOTargetStage(
        currentCategoryData: DealCategory,
        reportEventType: string,
        isExpired: boolean,
        isResult: boolean,
        isSuccess: boolean,
        isFail: boolean,
    ): string | null {
        let targetStageBtxId: string | null = null;
        let stageSuphicks = '';
        let stagePrephicks = 'cold';

        if (reportEventType === 'xo' || reportEventType === 'cold') {
            if (isExpired) {
                stageSuphicks = 'pending';
            }
            if (isFail) {
                stageSuphicks = 'fail';
                if (!isResult) {
                    stageSuphicks = 'noresult';
                }
            }

            if ((isResult && !isFail) || isSuccess) {
                stageSuphicks = 'success';
            }
            if (!isResult && !isExpired) {
                stageSuphicks = 'noresult';
            }
        }

        if (currentCategoryData.stages) {
            for (const stage of currentCategoryData.stages) {
                if (stage.code === `${stagePrephicks}_${stageSuphicks}`) {
                    targetStageBtxId = stage.bitrixId;
                }
            }
        }

        return targetStageBtxId;
    }

    getTargetStagePresentation(
        currentCategoryData: DealCategory,
        eventAction: string,
        isResult: boolean,
    ): string | null {
        let targetStageBtxId: string | null = null;
        let stageSuphicks = 'plan';
        let stagePrephicks = 'spres';

        if (eventAction === 'done' || eventAction === 'success') {
            stageSuphicks = 'success';
        } else if (eventAction === 'expired') {
            stageSuphicks = 'pending';
        } else if (eventAction === 'fail') {
            stageSuphicks = 'fail';
            if (!isResult) {
                stageSuphicks = 'noresult';
            }
        }

        if (currentCategoryData.stages) {
            for (const stage of currentCategoryData.stages) {
                if (stage.code === `${stagePrephicks}_${stageSuphicks}`) {
                    targetStageBtxId = stage.bitrixId;
                }
            }
        }

        return targetStageBtxId;
    }

    getIsCanDealStageUpdate(
        currentDeal: Deal | null,
        targetStageBtxId: string | null,
        currentCategoryData: DealCategory,
    ): boolean {
        let result = false;

        if (currentDeal && targetStageBtxId) {
            if (currentCategoryData.code === 'sales_base') {
                let isCurrentSearched = false;

                if (currentCategoryData.stages) {
                    for (const stage of currentCategoryData.stages) {
                        if (stage.bitrixId === targetStageBtxId) {
                            result = isCurrentSearched && true;
                        }

                        if (
                            `C${currentCategoryData.bitrixId}:${stage.bitrixId}` ===
                            currentDeal.STAGE_ID
                        ) {
                            isCurrentSearched = true;
                        }
                    }
                }
            } else {
                result = true;
            }
        }

        return result;
    }
}
