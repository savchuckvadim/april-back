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
import { TaskFlowDto, TaskFlowService } from '../services/task-flow/task-flow.service';
import { PlacementDto } from '../dto/event-sale-flow/placement.dto';
import { EnumEventItemResultType, EnumWorkStatusCode } from '../types/report-types';
import { IBXCompany, IBXContact, IBXDeal } from '@/modules/bitrix';
import { EnumEventPlanCode } from '../types/plan-types';
import { IBXLead } from '@/modules/bitrix/domain/interfaces/bitrix.interface';
import { CreateTaskDto } from '../services/task-flow/task-bitrix.service';
import { EventTaskDto } from '../dto/event-sale-flow/task.dto';
import { EventTitleService } from '../services/event-title/event-title.service';
import { SaleDto } from '../dto/event-sale-flow/sale.dto';
import { DealFlowService } from '../services/deal-flow/deal-flow.service';

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
    // private hook: string;
    // private portal: IPortal;
    // private domain: string;
    // private portalModel: PortalModel;

    // private relationLead?: LeadDto;
    // private plan: PlanDto;
    // private report: ReportDto;

    // private workStatus: any;

    // private isUnplannedPresentation?: boolean;
    // private entityType: string | null = null;
    // private entityId: number;
    // private currentTask: any;

    // private resultStatus: string;
    // private currentReportEventType: string = 'new';
    // private currentReportEventName: string = '';
    // private comment: string = '';
    // private currentTaskTitle: string = '';
    // private isResult = false;
    // private isExpired = false;
    // private isInWork = false;
    // private isFail = false;
    // private isSuccessSale = false;
    // private isNew = false;
    // private isPlanned = false;
    // private isPlanActive = true;
    // private isPresentationDone: boolean;
    // private nowDate: string;
    // private isDealFlow = false;
    // private isSmartFlow = true;
    // private isNoCall = false;
    // private postFail?: FailDto;
    // private isPostSale = false;
    // private bitrixDealService: BitrixDealService;
    // private bitrixDealBatchFlowService: BitrixDealBatchFlowService;
    // private bitrixBatchService: BitrixBatchService;

    constructor(
        private readonly portalService: PortalService,
        private readonly pbx: PBXService,
    ) { }



    async getFlow(

        dto: EventSalesFlowDto,
    ): Promise<any> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);
        const {
            isSuccessSale,


            isExpired,
            planContactId,
            reportContactId,
            planResponsibleId,
            reportResponsibleId,
            isNoCall,
            entityType,
            entityId,
            planEventType,
            reportEventType,
            planEventTypeName,
            reportEventTypeName,
            isResult,

            isFail,
            isPlanned,
            isInWork,
            isPostSale,
            isPresentationDone,
            isNeedReturnToTmc,
            nowDate,
        } = this.getFlowData(dto);


        let company: IBXCompany | null = null;
        let companyId: number | null = null;
        let lead: IBXLead | null = null;
        let leadId: number | null = null;


        const entityResult = await bitrix[entityType].get(
            entityId
        );
        const entity = entityResult.result;
        if (entityType === 'company') {
            company = entity as IBXCompany;
            companyId = entity.ID ?? 0;
        } else if (entityType === 'lead') {
            lead = entity as IBXLead;
            leadId = entity.ID ?? 0;
        }

        const taskFlowService = new TaskFlowService(bitrix);

        const taskFlowDto: TaskFlowDto = {
            currentTask: dto.currentTask,
            entityType,
            entityId,
            isExpired,
            isPlanned: dto.plan?.isPlanned ?? false,
        }

        const createTaskDto: CreateTaskDto = {

            responsibleId: dto.plan?.responsibility?.ID ?? 0,
            isPriority: false,
            type: dto.plan?.type.current.code as EnumEventPlanCode,
            stringType: dto.plan?.type.current.name,
            company: company as IBXCompany,
            companyId: companyId ?? 0,
            leadId: leadId ?? 0,
            createdId: dto.plan?.createdBy?.ID ?? 0,
            deadline: dto.plan?.deadline ?? '',
            name: dto.plan?.name ?? '',
            comment: dto.report.description ?? '',
            currentSmartItemId: undefined,
            contact: dto.plan?.contact as IBXContact,
            currentDealsItemIds: undefined,
            callingTaskGroupId: 0,
            currentTaskId: undefined,
            isNeedCompleteOtherTasks: false,
            isXO: false,
        }


        await taskFlowService.flow(taskFlowDto, createTaskDto);

        const dealFlowService = new DealFlowService(bitrix);
        const dealFlowResult = await dealFlowService.getDealFlow(
            // currentBaseDeal
            null,
            // currentPresDeal
            null,
            // currentColdDeal
            null,
            // currentTMCDeal
            null,
            // currentBtxDeals
            null,
            // portal
            PortalModel,
            // entityId
            entityId,
            // planResponsibleId
            planResponsibleId,
            // currentPlanEventType
            planEventType,
            // currentReportEventType
            reportEventType,
            // currentPlanEventName
            planEventTypeName,
            // currentReportEventName
            reportEventTypeName,
            // isResult
            isResult,
            // isSuccessSale
            isSuccessSale,
            // isFail
            isFail,
            // isExpired
            isExpired,
            // isPlanned
            isPlanned,
            // isInWork
            isInWork,
            // isNoCall
            isNoCall,
            // isPostSale
            isPostSale ?? false,
            // isPresentationDone
            isPresentationDone,
            // isNeedReturnToTmc
            isNeedReturnToTmc,
            // nowDate
            nowDate,
            // nowDate
        );

        return { result: true, error: '', data: null, dealFlowResult: dealFlowResult };
    }

    private getFlowData(dto: EventSalesFlowDto) {

        const isPlanActive = dto.plan?.isActive ?? false;
        const isPlanned = dto.plan?.isPlanned && isPlanActive;
        const isExpired = this.getIsExpired(dto.report, dto.plan, isPlanActive);

        const planContactId = dto.plan?.contact?.ID ?? null;
        const reportContactId = dto.report?.contact?.ID ?? null;
        const planResponsibleId = dto.plan?.responsibility?.ID ?? null;
        const reportResponsibleId = dto.currentTask?.responsible?.id ?? null;
        const isNoCall = dto.report?.isNoCall ?? false;

        const entityType: 'lead' | 'company' =
            dto.placement?.placement.includes('LEAD') ? 'lead' : 'company';

        const entityId = dto.placement?.options?.ID ?? 0;

        const userComment = dto.report?.description ?? null;
        const noresultReason = dto.report?.noresultReason ?? null;
        const failReason = dto.report?.failReason ?? null;
        const failType = dto.report?.failType ?? null;
        const workStatus = dto.report?.workStatus?.current.code ?? null;
        const resultStatus = dto.report?.resultStatus ?? null;
        const isInWork = workStatus === EnumWorkStatusCode.inJob;
        const isPostSale = dto.isPostSale;
        const nowDate = new Date().toISOString();

        const isResult = resultStatus === EnumEventItemResultType.RESULT;
        const isNew = resultStatus === EnumEventItemResultType.NEW;
        const isSuccessSale = workStatus === EnumWorkStatusCode.success;
        const isFail = workStatus === EnumWorkStatusCode.fail;
        const isPresentationDone = dto.presentation.isPresentationDone ?? false;
        const isUnplannedPresentation = this.getIsUnplannedPresentation(isPresentationDone, dto.currentTask);
        const isNeedReturnToTmc = dto.returnToTmc?.isActive ?? false;


        const planCreatedId = dto.plan?.createdBy?.ID ?? null;

        // const planTmcId = dto.plan?.tmc?.ID ?? null;
        const planDeadline = dto.plan?.deadline ?? null;
        const eventTitleService = new EventTitleService();
        const { type: planEventType,
            typeName: planEventTypeName,
            name: planEventName,
            emoji: planEventEmoji,
            color: planEventColor,
            title: planEventTitle
        } = eventTitleService.getPlanEventName(dto.plan);
        const {
            eventType: reportEventType,
            typeName: reportEventTypeName,
            currentTaskTitle: reportEventTitle

        } = eventTitleService.getReportEventName(dto.currentTask);

        const relationSalePresDeal = isSuccessSale && dto.sale ? this.getRelationSalePresDeal(isSuccessSale, dto.sale) : null;
        return {
            isSuccessSale,
            isPlanned,
            isInWork,
            isPostSale,
            isPresentationDone,
            nowDate,
            userComment,
            noresultReason,
            failReason,
            failType,
            isResult,
            isNew,
            isFail,
            isUnplannedPresentation,
            isNeedReturnToTmc,
            planCreatedId,
            planDeadline,
            isPlanActive,

            isExpired,
            relationSalePresDeal,
            planEventTypeName,
            planEventType,
            planEventName,
            planEventEmoji,
            planEventColor,
            planEventTitle,
            reportEventTypeName,
            reportEventType,
            reportEventTitle,
            planContactId,
            reportContactId,
            planResponsibleId,
            reportResponsibleId,
            isNoCall,
            entityType,
            entityId,
        };
    }


    protected getIsExpired(report: ReportDto, plan: PlanDto, isPlanActive: boolean) {
        const resultStatus = report.resultStatus;
        const isPlanned = plan.isPlanned;
        return resultStatus !== EnumEventItemResultType.RESULT &&
            resultStatus !== EnumEventItemResultType.NEW &&
            !isPlanned &&
            isPlanActive;
    }
    protected getEntityInfo(placement: PlacementDto) {
        let entityType: 'lead' | 'company' = 'lead';
        let entityId: number = 0;
        if (placement?.placement) {
            if (placement.placement == 'CALL_CARD') {
                if (placement.options) {
                    if (placement.options['CRM_BINDINGS']) {
                        const crmBinds = placement.options['CRM_BINDINGS'];
                        for (const crmBind of crmBinds) {
                            if (crmBind.ENTITY_TYPE) {
                                const binedEntityType = crmBind.ENTITY_TYPE;
                                if (binedEntityType == 'LEAD') {
                                    entityType = 'lead';
                                    entityId = crmBind.ENTITY_ID;
                                    break;
                                }
                                if (binedEntityType == 'COMPANY') {
                                    entityType = 'company';
                                    entityId = crmBind.ENTITY_ID;
                                    break;
                                }
                            }
                        }
                    }
                }
            } else if (placement.placement.includes('COMPANY')) {
                entityType = 'company';
                entityId = placement.placement['ID'];
            } else if (placement.placement.includes('LEAD')) {
                entityType = 'lead';
                entityId = placement.placement['ID'];
            }

        }
        return {
            entityType,
            entityId,
        };
    }


    protected getIsUnplannedPresentation(
        isPresentationDone: boolean,
        currentTask?: EventTaskDto,
    ) {
        let isUnplannedPresentation = false;
        if (isPresentationDone && (currentTask?.eventType !== 'presentation' || !currentTask)) {
            isUnplannedPresentation = true;
        }
        return isUnplannedPresentation;
    }


    protected getRelationSalePresDeal(isSuccessSale: boolean, sale: SaleDto | null): IBXDeal | null {
        let relationSalePresDeal: IBXDeal | null = null;
        if (isSuccessSale && sale) {
            relationSalePresDeal = sale.relationSalePresDeal ?? null;
        }
        return relationSalePresDeal;
    }
    // protected async getNEWBatchDealFlow(
    //     hook: string,
    //     currentBaseDeal: Deal | null,
    //     currentPresDeal: Deal | null,
    //     currentColdDeal: Deal | null,
    //     currentTMCDeal: Deal | null,
    //     currentBtxDeals: Deal[] | null,
    //     portalDealData: PortalDeal,
    //     entityId: number,
    //     planResponsibleId: number,
    //     currentPlanEventType: string | null,
    //     currentReportEventType: string,
    //     currentPlanEventName: string | null,
    //     currentReportEventName: string | null,
    //     isResult: boolean,
    //     isSuccessSale: boolean,
    //     isFail: boolean,
    //     isExpired: boolean,
    //     isPlanned: boolean,
    //     isInWork: boolean,
    //     isNoCall: boolean,
    //     isPostSale: boolean,
    //     isPresentationDone: boolean,
    //     isNeedReturnToTmc: boolean,
    //     nowDate: string,
    // ) {
    //     const result = {
    //         dealIds: ['$result'],
    //         planDeals: null,
    //         newPresDeal: null,
    //         commands: null,
    //         unplannedPresDeals: null,
    //     };

    //     let currentDealId = currentBaseDeal?.ID || (null as string | null);
    //     let xoDealId = currentColdDeal?.ID || (null as string | null);
    //     let reportPresDealId = currentPresDeal?.ID || (null as string | null);

    //     const reportDeals: string[] = [];
    //     const planDeals: string[] = [];
    //     const resultBatchCommands: Record<string, any> = {};
    //     const isUnplanned =
    //         isPresentationDone && currentReportEventType !== 'presentation';
    //     let unplannedPresDeal = null as string | null;
    //     let newPresDeal = null as string | null;

    //     if (!isPostSale) {
    //         if (!currentBtxDeals) {
    //             const setNewDealData = {
    //                 COMPANY_ID: entityId.toString(),
    //                 CATEGORY_ID: portalDealData.categories
    //                     .find(c => c.code === 'sales_base')
    //                     ?.bitrixId.toString(),
    //                 ASSIGNED_BY_ID: planResponsibleId.toString(),
    //             };

    //             currentDealId = await this.bitrixDealService.setDeal(
    //                 hook,
    //                 setNewDealData,
    //             );

    //             if (currentDealId && !currentBaseDeal) {
    //                 const newBaseDeal = await this.bitrixDealService.getDeal(
    //                     hook,
    //                     {
    //                         id: Number(currentDealId),
    //                     },
    //                 );
    //                 currentBaseDeal = newBaseDeal;
    //                 currentBtxDeals = [newBaseDeal as Deal];
    //             }
    //         }
    //     }

    //     let currentReportStatus = 'done';

    //     if (isFail) {
    //         currentReportStatus = 'fail';
    //     } else if (isSuccessSale) {
    //         currentReportStatus = 'success';
    //     } else {
    //         if (isResult) {
    //             if (isInWork) {
    //                 // Handle in work case
    //             }
    //         } else {
    //             if (isPlanned) {
    //                 currentReportStatus = 'expired';
    //             }
    //         }
    //     }

    //     for (const category of portalDealData.categories) {
    //         switch (category.code) {
    //             case 'sales_base': {
    //                 const currentStageOrder =
    //                     this.bitrixDealService.getEventOrderFromCurrentBaseDeal(
    //                         currentBaseDeal,
    //                         category,
    //                     );
    //                 const targetStageBtxId =
    //                     this.bitrixDealService.getSaleBaseTargetStage(
    //                         category,
    //                         currentStageOrder,
    //                         currentPlanEventType,
    //                         currentReportEventType,
    //                         currentPlanEventName,
    //                         currentReportEventName,
    //                         isResult,
    //                         isUnplanned,
    //                         isSuccessSale,
    //                         isFail,
    //                     );

    //                 const fieldsData = {
    //                     CATEGORY_ID: category.bitrixId,
    //                     STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
    //                     COMPANY_ID: entityId,
    //                     ASSIGNED_BY_ID: planResponsibleId,
    //                 };

    //                 if (currentDealId) {
    //                     const batchCommand =
    //                         this.bitrixDealBatchFlowService.getBatchCommand(
    //                             fieldsData,
    //                             'update',
    //                             Number(currentDealId),
    //                         );
    //                     const key = `update_${category.code}_${currentDealId}`;
    //                     resultBatchCommands[key] = batchCommand;
    //                 } else {
    //                     const batchCommand =
    //                         this.bitrixDealBatchFlowService.getBatchCommand(
    //                             fieldsData,
    //                             'add',
    //                             null,
    //                         );
    //                     const key = `set_${category.code}`;
    //                     resultBatchCommands[key] = batchCommand;
    //                     currentDealId = `$result[${key}]`;
    //                 }

    //                 const entityCommand = this.getEntityBatchFlowCommand(
    //                     true,
    //                     currentBaseDeal,
    //                     'base',
    //                     Number(currentBaseDeal?.ID),
    //                     '',
    //                 );
    //                 const key = `entity_base_deal_${currentDealId}`;
    //                 resultBatchCommands[key] = entityCommand;

    //                 if (currentPlanEventType) {
    //                     planDeals.push(currentDealId);
    //                 }
    //                 reportDeals.push(currentDealId);
    //                 break;
    //             }

    //             case 'sales_xo': {
    //                 if (!isNoCall) {
    //                     const targetStageBtxId =
    //                         this.bitrixDealService.getXOTargetStage(
    //                             category,
    //                             currentReportEventType,
    //                             isExpired,
    //                             isResult,
    //                             isSuccessSale,
    //                             isFail,
    //                         );

    //                     const fieldsData = {
    //                         CATEGORY_ID: category.bitrixId,
    //                         STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
    //                         COMPANY_ID: entityId,
    //                         ASSIGNED_BY_ID: planResponsibleId,
    //                     };

    //                     if (xoDealId) {
    //                         const batchCommand =
    //                             this.bitrixDealBatchFlowService.getBatchCommand(
    //                                 fieldsData,
    //                                 'update',
    //                                 Number(xoDealId),
    //                             );
    //                         const key = `update_${category.code}_${xoDealId}`;
    //                         resultBatchCommands[key] = batchCommand;
    //                     }
    //                 }
    //                 break;
    //             }

    //             case 'sales_presentation': {
    //                 if (!isNoCall) {
    //                     if (currentReportEventType === 'presentation') {
    //                         if (reportPresDealId) {
    //                             reportDeals.push(reportPresDealId);

    //                             const targetStageBtxId =
    //                                 this.bitrixDealService.getTargetStagePresentation(
    //                                     category,
    //                                     currentReportStatus,
    //                                     isResult,
    //                                 );

    //                             const fieldsData = {
    //                                 STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
    //                             };

    //                             const batchCommand =
    //                                 this.bitrixDealBatchFlowService.getBatchCommand(
    //                                     fieldsData,
    //                                     'update',
    //                                     Number(reportPresDealId),
    //                                 );
    //                             const key = `update_${category.code}_${reportPresDealId}`;
    //                             resultBatchCommands[key] = batchCommand;

    //                             const entityCommand =
    //                                 this.getEntityBatchFlowCommandFromIdForNewDeal(
    //                                     true,
    //                                     reportPresDealId,
    //                                     'presentation',
    //                                     Number(currentBaseDeal?.ID),
    //                                     currentReportStatus,
    //                                 );

    //                             const key2 = `update_entity_deal_plan_${category.code}`;
    //                             resultBatchCommands[key2] = entityCommand;
    //                         }
    //                     } else if (currentPlanEventType === 'presentation') {
    //                         const targetStageBtxId =
    //                             this.bitrixDealService.getTargetStagePresentation(
    //                                 category,
    //                                 'plan',
    //                                 isResult,
    //                             );

    //                         const fieldsData = {
    //                             TITLE: `Презентация ${currentPlanEventName}`,
    //                             CATEGORY_ID: category.bitrixId,
    //                             STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
    //                             COMPANY_ID: entityId,
    //                             ASSIGNED_BY_ID: planResponsibleId,
    //                         };

    //                         if (currentTMCDeal) {
    //                             fieldsData['UF_CRM_TO_BASE_TMC'] =
    //                                 currentTMCDeal.ID;
    //                         }

    //                         const batchCommand =
    //                             this.bitrixDealBatchFlowService.getBatchCommand(
    //                                 fieldsData,
    //                                 'add',
    //                                 null,
    //                             );
    //                         const key = `set_${category.code}`;
    //                         resultBatchCommands[key] = batchCommand;
    //                         newPresDeal = `$result[${key}]`;

    //                         const entityCommand =
    //                             this.getEntityBatchFlowCommandFromIdForNewDeal(
    //                                 true,
    //                                 newPresDeal,
    //                                 'presentation',
    //                                 Number(currentBaseDeal?.ID),
    //                                 'plan',
    //                             );

    //                         const key2 = `update_entity_deal_plan_${category.code}`;
    //                         resultBatchCommands[key2] = entityCommand;

    //                         planDeals.push(newPresDeal);
    //                     }

    //                     if (isUnplanned) {
    //                         const targetStageBtxId =
    //                             this.bitrixDealService.getTargetStagePresentation(
    //                                 category,
    //                                 'done',
    //                                 isResult,
    //                             );

    //                         const fieldsData = {
    //                             TITLE: `Презентация от ${nowDate}`,
    //                             CATEGORY_ID: category.bitrixId,
    //                             STAGE_ID: `C${category.bitrixId}:${targetStageBtxId}`,
    //                             COMPANY_ID: entityId,
    //                             ASSIGNED_BY_ID: planResponsibleId,
    //                         };

    //                         const batchCommand =
    //                             this.bitrixDealBatchFlowService.getBatchCommand(
    //                                 fieldsData,
    //                                 'add',
    //                                 null,
    //                             );
    //                         const key = `set_unplanned_${category.code}`;
    //                         resultBatchCommands[key] = batchCommand;
    //                         unplannedPresDeal = `$result[${key}]`;

    //                         const entityCommand =
    //                             this.getEntityBatchFlowCommandFromIdForNewDeal(
    //                                 true,
    //                                 unplannedPresDeal,
    //                                 'presentation',
    //                                 Number(currentBaseDeal?.ID),
    //                                 'unplanned',
    //                             );

    //                         const key2 = `entity_unplannedbase_deal_${currentBaseDeal?.ID}`;
    //                         resultBatchCommands[key2] = entityCommand;

    //                         const entityCommand2 =
    //                             this.getEntityBatchFlowCommandFromIdForNewDeal(
    //                                 true,
    //                                 unplannedPresDeal,
    //                                 'presentation',
    //                                 Number(currentDealId),
    //                                 'unplanned',
    //                             );

    //                         const key3 = 'entity_unplanned_deal';
    //                         resultBatchCommands[key3] = entityCommand2;
    //                     }
    //                 }
    //                 break;
    //             }

    //             case 'tmc_base': {
    //                 if (!isNeedReturnToTmc && !isNoCall) {
    //                     if (
    //                         currentTMCDeal &&
    //                         currentPlanEventType === 'presentation'
    //                     ) {
    //                         const categoryId = category.bitrixId;

    //                         const fieldsData = {
    //                             CATEGORY_ID: categoryId,
    //                             STAGE_ID: `C${categoryId}:PRES_PLAN`,
    //                             UF_CRM_TO_BASE_SALES: currentBaseDeal?.ID,
    //                             UF_CRM_TO_PRESENTATION_SALES: newPresDeal,
    //                             UF_CRM_LAST_PRES_DONE_RESPONSIBLE:
    //                                 planResponsibleId,
    //                             UF_CRM_MANAGER_OP: planResponsibleId,
    //                         };

    //                         const batchCommand =
    //                             this.bitrixDealBatchFlowService.getBatchCommand(
    //                                 fieldsData,
    //                                 'update',
    //                                 Number(currentTMCDeal.ID),
    //                             );
    //                         const key = `update_${category.code}_${currentTMCDeal.ID}`;
    //                         resultBatchCommands[key] = batchCommand;
    //                     }
    //                 }
    //                 break;
    //             }
    //         }
    //     }

    //     if (currentPresDeal) {
    //         const entityCommand = this.getEntityBatchFlowCommand(
    //             true,
    //             currentPresDeal,
    //             'presentation',
    //             Number(currentBaseDeal?.ID),
    //             'done',
    //         );
    //         const key = `entity_pres_deal_${currentPresDeal.ID}`;
    //         resultBatchCommands[key] = entityCommand;
    //     }

    //     const companyCommand = this.getEntityBatchFlowCommand();
    //     const key = 'entity_company';
    //     resultBatchCommands[key] = companyCommand;

    //     await this.bitrixBatchService.sendGeneralBatchRequest(
    //         resultBatchCommands,
    //     );

    //     return {
    //         dealIds: ['$result'],
    //         planDeals,
    //         reportDeals,
    //         newPresDeal,
    //         unplannedPresDeals: isUnplanned ? [unplannedPresDeal] : null,
    //         commands: resultBatchCommands,
    //     };
    // }

}
