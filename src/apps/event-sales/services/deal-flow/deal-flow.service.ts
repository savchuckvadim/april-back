import { BitrixService, IBXDeal } from "@/modules/bitrix";
import { BitrixDealService } from "./bitrix-deal.service";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { Logger } from "@nestjs/common";

export class DealFlowService {
    private bitrixDealService: BitrixDealService;
    private bitrix: BitrixService;
    private logger: Logger;
    constructor(
        bitrix: BitrixService
    ) {
        this.bitrixDealService = new BitrixDealService(bitrix);
        this.bitrix = bitrix;
        this.logger = new Logger(DealFlowService.name);
        this.logger.log('DealFlowService constructor');
    }

    async getDealFlow(


        currentBaseDeal: IBXDeal | null,
        currentPresDeal: IBXDeal | null,
        currentColdDeal: IBXDeal | null,
        currentTMCDeal: IBXDeal | null,
        currentBtxDeals: IBXDeal[] | null,
        portal: PortalModel,
        entityId: number,
        planResponsibleId: number,
        currentPlanEventType: string | null,
        currentReportEventType: string,
        currentPlanEventName: string | null,
        currentReportEventName: string | null,
        isResult: boolean,
        isSuccessSale: boolean,
        isFail: boolean,
        isExpired: boolean,
        isPlanned: boolean,
        isInWork: boolean,
        isNoCall: boolean,
        isPostSale: boolean,
        isPresentationDone: boolean,
        isNeedReturnToTmc: boolean,
        nowDate: string,
    ) {
        const result = {
            dealIds: ['$result'],
            planDeals: null,
            newPresDeal: null,
            commands: null,
            unplannedPresDeals: null,
        };

        let currentDealId = currentBaseDeal?.ID || (null as string | null);
        let xoDealId = currentColdDeal?.ID || (null as string | null);
        let reportPresDealId = currentPresDeal?.ID || (null as string | null);

        const reportDeals: string[] = [];
        const planDeals: string[] = [];
        const resultBatchCommands: Record<string, any> = {};
        const isUnplanned =
            isPresentationDone && currentReportEventType !== 'presentation';
        let unplannedPresDeal = null as string | null;
        let newPresDeal = null as string | null;
        const portalDealData = portal.getDeal()



        if (!isPostSale) {
            if (!currentBtxDeals) {
                const setNewDealData = {
                    COMPANY_ID: entityId.toString(),
                    CATEGORY_ID: portalDealData.categories
                        .find(c => c.code === 'sales_base')
                        ?.bitrixId.toString(),
                    ASSIGNED_BY_ID: planResponsibleId.toString(),
                };

                currentDealId = await this.bitrixDealService.setDeal(

                    setNewDealData,
                );

                if (currentDealId && !currentBaseDeal) {
                    const newBaseDeal = await this.bitrixDealService.getDeal(
                        Number(currentDealId)
                    );
                    currentBaseDeal = newBaseDeal;
                    currentBtxDeals = [newBaseDeal as IBXDeal];
                }
            }
        }

        let currentReportStatus = 'done';

        if (isFail) {
            currentReportStatus = 'fail';
        } else if (isSuccessSale) {
            currentReportStatus = 'success';
        } else {
            if (isResult) {
                if (isInWork) {
                    // Handle in work case
                }
            } else {
                if (isPlanned) {
                    currentReportStatus = 'expired';
                }
            }
        }

        for (const category of portalDealData.categories) {
            switch (category.code) {
                case 'sales_base': {
                    const currentStageOrder =
                        this.bitrixDealService.getEventOrderFromCurrentBaseDeal(
                            currentBaseDeal,
                            category,
                        );
                    const targetStageBtxId =
                        this.bitrixDealService.getSaleBaseTargetStage(
                            category,
                            currentStageOrder,
                            currentPlanEventType,
                            currentReportEventType,
                            currentPlanEventName,
                            currentReportEventName,
                            isResult,
                            isUnplanned,
                            isSuccessSale,
                            isFail,
                        );

                    const fieldsData = {
                        CATEGORY_ID: category.bitrixId,
                        STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
                        COMPANY_ID: entityId.toString(),
                        ASSIGNED_BY_ID: planResponsibleId.toString(),
                    };

                    if (currentDealId) {
                        // const batchCommand =
                        // this.bitrixDealBatchFlowService.getBatchCommand(
                        //     fieldsData,
                        //     'update',
                        //     Number(currentDealId),
                        // );
                        const key = `update_${category.code}_${currentDealId}`;
                        // resultBatchCommands[key] = batchCommand;
                        this.bitrix.batch.deal.update(key, Number(currentDealId), fieldsData);
                    } else {
                        // const batchCommand =
                        //     this.bitrixDealBatchFlowService.getBatchCommand(
                        //         fieldsData,
                        //         'add',
                        //         null,
                        //     );
                        const key = `set_${category.code}`;
                        // resultBatchCommands[key] = batchCommand;
                        this.bitrix.batch.deal.set(key, fieldsData);
                        currentDealId = `$result[${key}]`;
                    }


                    //todo entity command


                    // const entityCommand = this.getEntityBatchFlowCommand(
                    //     true,
                    //     currentBaseDeal,
                    //     'base',
                    //     Number(currentBaseDeal?.ID),
                    //     '',
                    // );
                    // const key = `entity_base_deal_${currentDealId}`;
                    // resultBatchCommands[key] = entityCommand;

                    if (currentPlanEventType) {
                        planDeals.push(currentDealId.toString());
                    }
                    reportDeals.push(currentDealId.toString());
                    break;
                }

                case 'sales_xo': {
                    if (!isNoCall) {
                        const targetStageBtxId =
                            this.bitrixDealService.getXOTargetStage(
                                category,
                                currentReportEventType,
                                isExpired,
                                isResult,
                                isSuccessSale,
                                isFail,
                            );

                        const fieldsData = {
                            CATEGORY_ID: category.bitrixId,
                            STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
                            COMPANY_ID: entityId.toString(),
                            ASSIGNED_BY_ID: planResponsibleId.toString(),
                        };

                        if (xoDealId) {
                            // const batchCommand =
                            //     this.bitrixDealBatchFlowService.getBatchCommand(
                            //         fieldsData,
                            //         'update',
                            //         Number(xoDealId),
                            //     );
                            const key = `update_${category.code}_${xoDealId}`;
                            // resultBatchCommands[key] = batchCommand;
                            this.bitrix.batch.deal.update(key, Number(xoDealId), fieldsData);

                        }
                    }
                    break;
                }

                case 'sales_presentation': {
                    if (!isNoCall) {
                        if (currentReportEventType === 'presentation') {
                            if (reportPresDealId) {
                                reportDeals.push(reportPresDealId.toString());

                                const targetStageBtxId =
                                    this.bitrixDealService.getTargetStagePresentation(
                                        category,
                                        currentReportStatus,
                                        isResult,
                                    );

                                const fieldsData = {
                                    STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
                                };

                                // const batchCommand =
                                //     this.bitrixDealBatchFlowService.getBatchCommand(
                                //         fieldsData,
                                //         'update',
                                //         Number(reportPresDealId),
                                //     );
                                const key = `update_${category.code}_${reportPresDealId}`;
                                // resultBatchCommands[key] = batchCommand;
                                this.bitrix.batch.deal.update(key, Number(reportPresDealId), fieldsData);


                                //TODO ENTITY FLOW COMMAND
                                // const entityCommand =
                                //     this.getEntityBatchFlowCommandFromIdForNewDeal(
                                //         true,
                                //         reportPresDealId,
                                //         'presentation',
                                //         Number(currentBaseDeal?.ID),
                                //         currentReportStatus,
                                //     );

                                // const key2 = `update_entity_deal_plan_${category.code}`;
                                // resultBatchCommands[key2] = entityCommand;
                            }
                        } else if (currentPlanEventType === 'presentation') {
                            const targetStageBtxId =
                                this.bitrixDealService.getTargetStagePresentation(
                                    category,
                                    'plan',
                                    isResult,
                                );

                            const fieldsData = {
                                TITLE: `Презентация ${currentPlanEventName}`,
                                CATEGORY_ID: category.bitrixId,
                                STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
                                COMPANY_ID: entityId.toString(),
                                ASSIGNED_BY_ID: planResponsibleId.toString(),
                            };

                            if (currentTMCDeal) {
                                fieldsData['UF_CRM_TO_BASE_TMC'] =
                                    currentTMCDeal.ID;
                            }

                            // const batchCommand =
                            //     this.bitrixDealBatchFlowService.getBatchCommand(
                            //         fieldsData,
                            //         'add',
                            //         null,
                            //     );
                            const key = `set_${category.code}`;


                            this.bitrix.batch.deal.set(key, fieldsData);
                            // resultBatchCommands[key] = batchCommand;
                            newPresDeal = `$result[${key}]`;



                            //TODO ENTITY FLOW COMMAND
                            // const entityCommand =
                            //     this.getEntityBatchFlowCommandFromIdForNewDeal(
                            //         true,
                            //         newPresDeal,
                            //         'presentation',
                            //         Number(currentBaseDeal?.ID),
                            //         'plan',
                            //     );

                            // const key2 = `update_entity_deal_plan_${category.code}`;
                            // resultBatchCommands[key2] = entityCommand;

                            planDeals.push(newPresDeal);
                        }

                        if (isUnplanned) {
                            const targetStageBtxId =
                                this.bitrixDealService.getTargetStagePresentation(
                                    category,
                                    'done',
                                    isResult,
                                );

                            const fieldsData = {
                                TITLE: `Презентация от ${nowDate}`,
                                CATEGORY_ID: category.bitrixId,
                                STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
                                COMPANY_ID: entityId.toString(),
                                ASSIGNED_BY_ID: planResponsibleId.toString(),
                            };

                            // const batchCommand =
                            // this.bitrixDealBatchFlowService.getBatchCommand(
                            //     fieldsData,
                            //     'add',
                            //     null,
                            // );
                            const key = `set_unplanned_${category.code}`;
                            // resultBatchCommands[key] = batchCommand;
                            this.bitrix.batch.deal.set(key, fieldsData);
                            unplannedPresDeal = `$result[${key}]`;


                            //TODO ENTITY FLOW COMMAND
                            // const entityCommand =
                            //     this.getEntityBatchFlowCommandFromIdForNewDeal(
                            //         true,
                            //         unplannedPresDeal,
                            //         'presentation',
                            //         Number(currentBaseDeal?.ID),
                            //         'unplanned',
                            //     );

                            // const key2 = `entity_unplannedbase_deal_${currentBaseDeal?.ID}`;
                            // resultBatchCommands[key2] = entityCommand;

                            // const entityCommand2 =
                            //     this.getEntityBatchFlowCommandFromIdForNewDeal(
                            //         true,
                            //         unplannedPresDeal,
                            //         'presentation',
                            //         Number(currentDealId),
                            //         'unplanned',
                            //     );

                            // const key3 = 'entity_unplanned_deal';
                            // resultBatchCommands[key3] = entityCommand2;
                        }
                    }
                    break;
                }

                case 'tmc_base': {
                    if (!isNeedReturnToTmc && !isNoCall) {
                        if (
                            currentTMCDeal &&
                            currentPlanEventType === 'presentation'
                        ) {
                            const categoryId = category.bitrixId;

                            const fieldsData = {
                                CATEGORY_ID: categoryId,
                                STAGE_ID: `C${categoryId}:PRES_PLAN`,
                                UF_CRM_TO_BASE_SALES: currentBaseDeal?.ID.toString(),
                                UF_CRM_TO_PRESENTATION_SALES: newPresDeal as string,
                                UF_CRM_LAST_PRES_DONE_RESPONSIBLE:
                                    planResponsibleId.toString(),
                                UF_CRM_MANAGER_OP: planResponsibleId.toString(),
                            };

                            // const batchCommand =
                            //     this.bitrixDealBatchFlowService.getBatchCommand(
                            //         fieldsData,
                            //         'update',
                            //         Number(currentTMCDeal.ID),
                            //     );
                            const key = `update_${category.code}_${currentTMCDeal.ID}`;
                            // resultBatchCommands[key] = batchCommand;
                            this.bitrix.batch.deal.update(key, Number(currentTMCDeal.ID), fieldsData);
                        }
                    }
                    break;
                }
            }
        }


        //TODO ENTITY FLOW COMMAND
        // if (currentPresDeal) {
        //     const entityCommand = this.getEntityBatchFlowCommand(
        //         true,
        //         currentPresDeal,
        //         'presentation',
        //         Number(currentBaseDeal?.ID),
        //         'done',
        //     );
        //     const key = `entity_pres_deal_${currentPresDeal.ID}`;
        //     resultBatchCommands[key] = entityCommand;
        // }

        // const companyCommand = this.getEntityBatchFlowCommand();
        // const key = 'entity_company';
        // resultBatchCommands[key] = companyCommand;



        //отправка batch запроса
       const batchResult = await this.bitrix.api.callBatchAsync();
       console.log(batchResult);
        return {
            dealIds: ['$result'],
            planDeals,
            reportDeals,
            newPresDeal,
            unplannedPresDeals: isUnplanned ? [unplannedPresDeal] : null,
            commands: resultBatchCommands,
        };
    }

    private baseDealFlow(){

    }
    private xoDealFlow(){

    }
    private presentationDealFlow(){

    }
    private tmcDealFlow(){

    }
}
