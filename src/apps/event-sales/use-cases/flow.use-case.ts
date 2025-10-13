import { Injectable, Logger, Scope } from '@nestjs/common';
import { FailDto } from '../dto/event-sale-flow/fail.dto';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { ReportDto } from '../dto/event-sale-flow/report.dto';

import { PlanDto } from '../dto/event-sale-flow/plan.dto';
import { LeadDto } from '../dto/event-sale-flow/lead.dto';
import { IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { PortalModel } from 'src/modules/portal/services/portal.model';
import { PortalService } from 'src/modules/portal/portal.service';
import { IBXPlacement } from 'src/modules/bitrix/domain/interfaces/bitrix-placement.intreface';
import { EBXEntity } from 'src/modules/bitrix/core';
import {
    BitrixDealService,
    Deal,
} from '../services/deal-flow/bitrix-deal.service';
import { BitrixDealBatchFlowService } from '../services/deal-flow/bitrix-deal-batch-flow.service';
import { BitrixBatchService } from '../services/general/bitrix-batch.service';
import { PBXService } from '@/modules/pbx';

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

// interface Deal {
//     ID: string;
//     CATEGORY_ID: string;
//     STAGE_ID: string;
//     COMPANY_ID?: string;
//     LEAD_ID?: string;
//     ASSIGNED_BY_ID: string;
//     TITLE?: string;
//     UF_CRM_TO_BASE_SALES?: number;
//     UF_CRM_TO_PRESENTATION_SALES?: number;
//     UF_CRM_PRES_COMMENTS?: string;
//     UF_CRM_LAST_PRES_DONE_RESPONSIBLE?: number;
//     UF_CRM_MANAGER_OP?: number;
// }

interface PortalDeal {
    categories: DealCategory[];
}

@Injectable()
export class EventSalesFlowUseCase {
    private hook: string;
    private portal: IPortal;
    private domain: string;
    private portalModel: PortalModel;

    private relationLead?: LeadDto;
    private plan: PlanDto;
    private report: ReportDto;

    private workStatus: any;

    private isUnplannedPresentation?: boolean;
    private entityType: string | null = null;
    private entityId: number;
    private currentTask: any;

    private resultStatus: string;
    private currentReportEventType: string = 'new';
    private currentReportEventName: string = '';
    private comment: string = '';
    private currentTaskTitle: string = '';
    private isResult = false;
    private isExpired = false;
    private isInWork = false;
    private isFail = false;
    private isSuccessSale = false;
    private isNew = false;
    private isPlanned = false;
    private isPlanActive = true;
    private isPresentationDone: boolean;
    private nowDate: string;
    private isDealFlow = false;
    private isSmartFlow = true;
    private isNoCall = false;
    private postFail?: FailDto;
    private isPostSale = false;
    private bitrixDealService: BitrixDealService;
    private bitrixDealBatchFlowService: BitrixDealBatchFlowService;
    private bitrixBatchService: BitrixBatchService;

    constructor(
        private readonly portalService: PortalService,
        private readonly pbx: PBXService,
    ) {}

    async init(data: EventSalesFlowDto): Promise<this> {
        this.portalModel = await this.portalService.getModelByDomain(
            data.domain,
        );

        this.portal = this.portalModel.getPortal();
        this.isPostSale = data.isPostSale ?? false;
        this.postFail = data.fail;
        this.relationLead = data.lead;
        this.plan = data.plan;
        this.report = data.report;
        this.resultStatus = data.report.resultStatus;
        this.workStatus = data.report.workStatus.current;
        this.isPresentationDone = data.presentation.isPresentationDone;
        this.isUnplannedPresentation =
            data.presentation.isUnplannedPresentation;

        this.nowDate = new Date().toLocaleString('ru-RU', {
            timeZone: this.getTimeZone(data.domain),
        });

        this.currentTask = data.currentTask || null;
        this.currentReportEventType = this.currentTask?.eventType || 'new';
        this.currentTaskTitle =
            this.currentTask?.TITLE || this.currentTask?.title || '';

        this.setResultFlags();
        this.setEntityTypeAndId(data.placement);
        this.setPlanDetails(data.plan);
        this.setHook(data.domain);

        return this;
    }

    async getFlow(
        domain: string,
    ): Promise<{ result: boolean; error: string; data: any }> {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        // this.bitrixDealService = new BitrixDealService(bitrix, PortalModel.getPortal())
        // this.bitrixDealBatchFlowService = new BitrixDealBatchFlowService()
        // this.bitrixBatchService = new BitrixBatchService(bitrix, PortalModel.getPortal())

        const data = {
            hook: this.hook,
            isUnplannedPresentation: this.isUnplannedPresentation,
            isPostSale: this.isPostSale,
            report: this.report,
            relationLead: this.relationLead,
            plan: this.plan,

            currentTask: this.currentTask,
            currentTaskTitle: this.currentTaskTitle,
            currentReportEventType: this.currentReportEventType,
            currentReportEventName: this.currentReportEventName,
            comment: this.comment,
            resultStatus: this.resultStatus,
            workStatus: this.workStatus,
            isResult: this.isResult,
            isExpired: this.isExpired,
            isInWork: this.isInWork,
            isFail: this.isFail,
            isSuccessSale: this.isSuccessSale,
            isNew: this.isNew,
            isPlanned: this.isPlanned,
            isPlanActive: this.isPlanActive,
            isPresentationDone: this.isPresentationDone,
            nowDate: this.nowDate,
            isDealFlow: this.isDealFlow,
            entityType: this.entityType,
            entityId: this.entityId,
        };

        return { result: true, error: '', data };
    }

    private setResultFlags(): void {
        // ...
    }

    private setEntityTypeAndId(placement: IBXPlacement | undefined): void {
        if (!placement) {
            this.entityType = null;
            this.entityId = 0;
            return;
        }
        this.entityType = placement.placement.includes('LEAD')
            ? EBXEntity.LEAD
            : EBXEntity.COMPANY;
        this.entityId = placement.options.ID as number;
    }

    private setPlanDetails(plan: any): void {
        // ...
    }

    private setHook(domain: string): void {
        this.hook = this.portal.C_REST_WEB_HOOK_URL;
    }

    private getTimeZone(domain: string): string {
        return 'Europe/Moscow';
    }

    protected async getNEWBatchDealFlow(
        hook: string,
        currentBaseDeal: Deal | null,
        currentPresDeal: Deal | null,
        currentColdDeal: Deal | null,
        currentTMCDeal: Deal | null,
        currentBtxDeals: Deal[] | null,
        portalDealData: PortalDeal,
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
                    hook,
                    setNewDealData,
                );

                if (currentDealId && !currentBaseDeal) {
                    const newBaseDeal = await this.bitrixDealService.getDeal(
                        hook,
                        {
                            id: Number(currentDealId),
                        },
                    );
                    currentBaseDeal = newBaseDeal;
                    currentBtxDeals = [newBaseDeal as Deal];
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
                        COMPANY_ID: entityId,
                        ASSIGNED_BY_ID: planResponsibleId,
                    };

                    if (currentDealId) {
                        const batchCommand =
                            this.bitrixDealBatchFlowService.getBatchCommand(
                                fieldsData,
                                'update',
                                Number(currentDealId),
                            );
                        const key = `update_${category.code}_${currentDealId}`;
                        resultBatchCommands[key] = batchCommand;
                    } else {
                        const batchCommand =
                            this.bitrixDealBatchFlowService.getBatchCommand(
                                fieldsData,
                                'add',
                                null,
                            );
                        const key = `set_${category.code}`;
                        resultBatchCommands[key] = batchCommand;
                        currentDealId = `$result[${key}]`;
                    }

                    const entityCommand = this.getEntityBatchFlowCommand(
                        true,
                        currentBaseDeal,
                        'base',
                        Number(currentBaseDeal?.ID),
                        '',
                    );
                    const key = `entity_base_deal_${currentDealId}`;
                    resultBatchCommands[key] = entityCommand;

                    if (currentPlanEventType) {
                        planDeals.push(currentDealId);
                    }
                    reportDeals.push(currentDealId);
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
                            COMPANY_ID: entityId,
                            ASSIGNED_BY_ID: planResponsibleId,
                        };

                        if (xoDealId) {
                            const batchCommand =
                                this.bitrixDealBatchFlowService.getBatchCommand(
                                    fieldsData,
                                    'update',
                                    Number(xoDealId),
                                );
                            const key = `update_${category.code}_${xoDealId}`;
                            resultBatchCommands[key] = batchCommand;
                        }
                    }
                    break;
                }

                case 'sales_presentation': {
                    if (!isNoCall) {
                        if (currentReportEventType === 'presentation') {
                            if (reportPresDealId) {
                                reportDeals.push(reportPresDealId);

                                const targetStageBtxId =
                                    this.bitrixDealService.getTargetStagePresentation(
                                        category,
                                        currentReportStatus,
                                        isResult,
                                    );

                                const fieldsData = {
                                    STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
                                };

                                const batchCommand =
                                    this.bitrixDealBatchFlowService.getBatchCommand(
                                        fieldsData,
                                        'update',
                                        Number(reportPresDealId),
                                    );
                                const key = `update_${category.code}_${reportPresDealId}`;
                                resultBatchCommands[key] = batchCommand;

                                const entityCommand =
                                    this.getEntityBatchFlowCommandFromIdForNewDeal(
                                        true,
                                        reportPresDealId,
                                        'presentation',
                                        Number(currentBaseDeal?.ID),
                                        currentReportStatus,
                                    );

                                const key2 = `update_entity_deal_plan_${category.code}`;
                                resultBatchCommands[key2] = entityCommand;
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
                                COMPANY_ID: entityId,
                                ASSIGNED_BY_ID: planResponsibleId,
                            };

                            if (currentTMCDeal) {
                                fieldsData['UF_CRM_TO_BASE_TMC'] =
                                    currentTMCDeal.ID;
                            }

                            const batchCommand =
                                this.bitrixDealBatchFlowService.getBatchCommand(
                                    fieldsData,
                                    'add',
                                    null,
                                );
                            const key = `set_${category.code}`;
                            resultBatchCommands[key] = batchCommand;
                            newPresDeal = `$result[${key}]`;

                            const entityCommand =
                                this.getEntityBatchFlowCommandFromIdForNewDeal(
                                    true,
                                    newPresDeal,
                                    'presentation',
                                    Number(currentBaseDeal?.ID),
                                    'plan',
                                );

                            const key2 = `update_entity_deal_plan_${category.code}`;
                            resultBatchCommands[key2] = entityCommand;

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
                                COMPANY_ID: entityId,
                                ASSIGNED_BY_ID: planResponsibleId,
                            };

                            const batchCommand =
                                this.bitrixDealBatchFlowService.getBatchCommand(
                                    fieldsData,
                                    'add',
                                    null,
                                );
                            const key = `set_unplanned_${category.code}`;
                            resultBatchCommands[key] = batchCommand;
                            unplannedPresDeal = `$result[${key}]`;

                            const entityCommand =
                                this.getEntityBatchFlowCommandFromIdForNewDeal(
                                    true,
                                    unplannedPresDeal,
                                    'presentation',
                                    Number(currentBaseDeal?.ID),
                                    'unplanned',
                                );

                            const key2 = `entity_unplannedbase_deal_${currentBaseDeal?.ID}`;
                            resultBatchCommands[key2] = entityCommand;

                            const entityCommand2 =
                                this.getEntityBatchFlowCommandFromIdForNewDeal(
                                    true,
                                    unplannedPresDeal,
                                    'presentation',
                                    Number(currentDealId),
                                    'unplanned',
                                );

                            const key3 = 'entity_unplanned_deal';
                            resultBatchCommands[key3] = entityCommand2;
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
                                UF_CRM_TO_BASE_SALES: currentBaseDeal?.ID,
                                UF_CRM_TO_PRESENTATION_SALES: newPresDeal,
                                UF_CRM_LAST_PRES_DONE_RESPONSIBLE:
                                    planResponsibleId,
                                UF_CRM_MANAGER_OP: planResponsibleId,
                            };

                            const batchCommand =
                                this.bitrixDealBatchFlowService.getBatchCommand(
                                    fieldsData,
                                    'update',
                                    Number(currentTMCDeal.ID),
                                );
                            const key = `update_${category.code}_${currentTMCDeal.ID}`;
                            resultBatchCommands[key] = batchCommand;
                        }
                    }
                    break;
                }
            }
        }

        if (currentPresDeal) {
            const entityCommand = this.getEntityBatchFlowCommand(
                true,
                currentPresDeal,
                'presentation',
                Number(currentBaseDeal?.ID),
                'done',
            );
            const key = `entity_pres_deal_${currentPresDeal.ID}`;
            resultBatchCommands[key] = entityCommand;
        }

        const companyCommand = this.getEntityBatchFlowCommand();
        const key = 'entity_company';
        resultBatchCommands[key] = companyCommand;

        await this.bitrixBatchService.sendGeneralBatchRequest(
            resultBatchCommands,
        );

        return {
            dealIds: ['$result'],
            planDeals,
            reportDeals,
            newPresDeal,
            unplannedPresDeals: isUnplanned ? [unplannedPresDeal] : null,
            commands: resultBatchCommands,
        };
    }

    private getEntityBatchFlowCommand(
        isDeal: boolean = false,
        deal: Deal | null = null,
        type: string = '',
        baseDealId: number | null = null,
        status: string = '',
    ) {
        // Implementation of getEntityBatchFlowCommand
        return {};
    }

    private getEntityBatchFlowCommandFromIdForNewDeal(
        isDeal: boolean,
        dealId: string | number,
        type: string,
        baseDealId: number | null,
        status: string,
    ) {
        // Implementation of getEntityBatchFlowCommandFromIdForNewDeal
        return {};
    }
}
