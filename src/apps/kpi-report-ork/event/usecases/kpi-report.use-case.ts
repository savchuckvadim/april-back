// report-kpi.service.ts
import { Injectable } from '@nestjs/common';
import {
    IField,
    IPBXList,
    IPortal,
    IFieldItem,
} from 'src/modules/portal/interfaces/portal.interface';

import { PortalModel } from 'src/modules/portal/services/portal.model';

import { ReportData, Filter, KPI } from '../dto/kpi.dto';
import { ActionOrkEventService } from '../services/action-service';
import { BitrixRequestApiService } from 'src/modules/bitrix/core/http/bitrix-request-api.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PortalContextService } from 'src/modules/portal/services/portal-context.service';
import { ReportGetFiltersDto } from '../dto/get-report-request.dto';
import { BXUserDto } from '../dto/get-report-request.dto';
import { EnumOrkFieldCode } from '../type/ork-list-history.enum';
import { EnumFilterInnerCode, FilterInnerCode } from '../type/ork-report-event.type';
import { PBXService } from '@/modules/pbx';
import { BitrixBaseApi, BitrixService } from '@/modules/bitrix';

export class ReportKpiUseCase {
    // protected domain: string;
    protected portal: IPortal;
    protected portalKPIList?: IPBXList;
    protected hook: string;
    private portalModel: PortalModel;
    private bitrix: BitrixService;
    private bitrixApi: BitrixBaseApi;

    constructor(
        // private readonly portalContext: PortalContextService,
        // private readonly bitrixApi: BitrixRequestApiService, // scope: REQUEST
        // private readonly bxFactory: BitrixApiFactoryService // scope: QUEUE
        private readonly pbx: PBXService,
    ) { }

    async init(domain: string) {
        // this.domain = domain;
        const { portal, PortalModel, bitrix } = await this.pbx.init(domain);

        //for queue
        // this.portalModel = await this.portalProvider.getModelByDomain(domain);
        // const portal = this.portalModel.getPortal();

        if (!portal) throw new Error('Portal not found');

        // //for queue
        this.portalModel = PortalModel;
        this.bitrix = bitrix;
        this.bitrixApi = bitrix.api;

        this.portal = portal;
        this.hook = PortalModel.getHook();

        this.portalKPIList = this.portalModel.getListByCode('service_ork_history');

    }

    async generateKpiReport(domain: string, dto: ReportGetFiltersDto): Promise<ReportData[]> {
        // const bitrixApi = this.bitrixContext.getApi();
        await this.init(domain);
        const departament = dto.departament;
        const dateFrom = dto.dateFrom;
        const dateTo = dto.dateTo;

        const listId = this.portalKPIList?.bitrixId;
        // const listFields = this.portalKPIList?.bitrixfields;
        const {
            eventAction,
            eventActionType,
            actionId,
            actionTypeId,
            eventResponsibleId,
            // eventDateId,
            dateFieldForHookFrom,
            dateFieldForHookTo,
        } = this.getPbxFiledsData().fields;

        const currentActionsData = this.getActionsData(
            eventAction?.items,
            eventActionType?.items,
        ) as Filter[];

        this.generateBatchCommands(
            departament,
            currentActionsData,
            eventResponsibleId,
            actionId,
            actionTypeId,
            dateFieldForHookFrom,
            dateFieldForHookTo,
            dateFrom,
            dateTo,
            listId as string,
        );
        // const commandsResult = bitrixApi.getCmdBatch();
        const results = await this.bitrixApi.callBatchWithConcurrency(3);
        const report = this.getCalculateResults(
            results,
            departament,
            currentActionsData,
        );

        return report;
    }

    private getPbxFiledsData = (): {
        fields: {
            eventAction: IField;
            eventActionType: IField;
            actionId: string;
            actionTypeId: string;
            eventResponsibleId: string;
            // eventDateId: string
            dateFieldForHookFrom: string;
            dateFieldForHookTo: string;
        };
    } => {
        const listFields = this.portalKPIList?.bitrixfields;

        let eventActionField = null as IField | null;
        let eventActionTypeField = null as IField | null;

        let actionFieldId: string | undefined;
        let actionTypeFieldId: string | undefined;
        let eventResponsibleFieldId: string | undefined;
        let eventDateFieldId: string | undefined;

        let dateFieldForHookFrom: string | undefined;
        let dateFieldForHookTo: string | undefined;

        if (listFields && listFields.length) {
            for (const plField of listFields) {
                const action = EnumOrkFieldCode.ork_event_action;
                const actionType = EnumOrkFieldCode.ork_event_type;
                switch (plField.code as EnumOrkFieldCode) {

                    case EnumOrkFieldCode.ork_event_action:
                        eventActionField = plField as IField;
                        actionFieldId = plField.bitrixCamelId;
                        break;

                    case EnumOrkFieldCode.ork_event_type:
                        eventActionTypeField = plField;
                        actionTypeFieldId = plField.bitrixCamelId;
                        break;

                    case EnumOrkFieldCode.responsible:
                        // eventResponsibleField = plField;
                        eventResponsibleFieldId = plField.bitrixCamelId;
                        break;

                    case EnumOrkFieldCode.ork_event_date:
                        // eventDateField = plField;
                        eventDateFieldId = plField.bitrixCamelId;
                        dateFieldForHookFrom = '>' + eventDateFieldId;
                        dateFieldForHookTo = '<' + eventDateFieldId;
                        break;
                }
            }
        }
        return {
            fields: {
                eventAction: eventActionField as IField,
                eventActionType: eventActionTypeField as IField,
                actionId: actionFieldId as string,
                actionTypeId: actionTypeFieldId as string,
                eventResponsibleId: eventResponsibleFieldId as string,
                // eventDateId: eventDateFieldId as string,
                dateFieldForHookFrom: dateFieldForHookFrom as string,
                dateFieldForHookTo: dateFieldForHookTo as string,
            },
        };
    };
    private getActionsData = (
        actionItems: IFieldItem[] | undefined,
        actionTypeItems: IFieldItem[] | undefined,
    ): Filter[] => {
        const currentActionsData = [] as Filter[];
        const actionService = new ActionOrkEventService();
        if (!actionTypeItems || !actionItems) {
            return currentActionsData;
        }
        if (actionTypeItems.length && actionItems.length) {
            for (const actionType of actionTypeItems) {
                for (const action of actionItems) {
                    const actionData = actionService.getActionWithTypeData(
                        actionType,
                        action,
                    );
                    if (actionData?.actionTypeItem && actionData?.actionItem) {
                        currentActionsData.push(actionData);
                    }
                }
            }
        }

        return currentActionsData.sort((a, b) => a.order - b.order);
    };

    private generateBatchCommands = (
        departament: BXUserDto[],
        currentActionsData: Filter[],
        eventResponsibleFieldId: string,

        actionFieldId: string,
        actionTypeFieldId: string,
        dateFieldForHookFrom: string,
        dateFieldForHookTo: string,
        dateFrom: string,
        dateTo: string,
        listId: string,
    ): void => {
        for (const user of departament) {
            const userId = user.ID;

            for (const action of currentActionsData) {
                const innerCode = action.innerCode;

                // если это обычный звонок, не результативный и не нерезультативный
                const isCommunicationResult = innerCode.includes(
                    'et_ork_call',
                );
                const isNoResult = innerCode.includes('noresult_communication' as FilterInnerCode);
                const isCall = innerCode.includes('call' as FilterInnerCode);

                if (!isCommunicationResult && !isNoResult && isCall) {
                    const actionValuebitrixId = action.actionItem.bitrixId;
                    const actionTypeValuebitrixId =
                        action.actionTypeItem.bitrixId;
                    const cmdKey = `user_${userId}_action_${action.code}`;
                    if (action.code == 'et_ork_call_collect_ea_ork_plan') {
                        const getListData = {
                            IBLOCK_TYPE_ID: 'lists',
                            IBLOCK_ID: listId,
                            filter: {
                                [`${eventResponsibleFieldId}`]: userId,
                                [`${actionFieldId}`]: actionValuebitrixId,
                                [`${actionTypeFieldId}`]: [
                                    actionTypeValuebitrixId,
                                ] as string[] | number[],
                                [`${dateFieldForHookFrom}`]: dateFrom,
                                [`${dateFieldForHookTo}`]: dateTo,
                            },
                            select: ['ID'],
                        };

                        for (const callPlanAction of currentActionsData) {
                            if (
                                callPlanAction.code == 'et_ork_call_collect_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_call_doc_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_call_money_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_edu_ea_ork_plan' ||

                                callPlanAction.code == 'et_ork_complect_up_work_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_pere_contract_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_complect_up_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_complect_down_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_fail_prevention_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_fail_work_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_threat_ea_ork_plan' ||
                                callPlanAction.code == 'et_ork_fail_work_success_ea_ork_plan'

                            ) {
                                const actionTypeArray = getListData.filter[
                                    `${actionTypeFieldId}`
                                ] as (string | number)[];
                                actionTypeArray.push(
                                    callPlanAction.actionTypeItem.bitrixId as
                                    | string
                                    | number,
                                );
                            }
                        }

                        this.bitrixApi.addCmdBatch(
                            cmdKey,
                            'lists.element.get',
                            getListData,
                        );
                    }

                    if (action.code == 'et_ork_call_collect_ea_ork_done') {
                        const getListData = {
                            IBLOCK_TYPE_ID: 'lists',
                            IBLOCK_ID: listId,
                            filter: {
                                [`${eventResponsibleFieldId}`]: userId,
                                [`${actionFieldId}`]: actionValuebitrixId,
                                [`${actionTypeFieldId}`]: [
                                    actionTypeValuebitrixId,
                                ] as string[] | number[],
                                [`${dateFieldForHookFrom}`]: dateFrom,
                                [`${dateFieldForHookTo}`]: dateTo,
                            },
                            select: ['ID'],
                        };

                        for (const callDoneAction of currentActionsData) {
                            if (
                                callDoneAction.code == 'et_ork_call_doc_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_call_money_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_call_collect_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_info_garant_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_presentation_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_edu_ea_ork_done' ||

                                callDoneAction.code == 'et_ork_complect_up_work_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_pere_contract_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_complect_up_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_complect_down_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_fail_prevention_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_fail_work_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_threat_ea_ork_done' ||
                                callDoneAction.code == 'et_ork_fail_work_success_ea_ork_done'

                            ) {
                                const actionTypeArray = getListData.filter[
                                    `${actionTypeFieldId}`
                                ] as (string | number)[];
                                actionTypeArray.push(
                                    callDoneAction.actionTypeItem.bitrixId as
                                    | string
                                    | number,
                                );
                            }
                        }

                        this.bitrixApi.addCmdBatch(
                            cmdKey,
                            'lists.element.get',
                            getListData,
                        );
                    }
                }
            }

            for (const action of currentActionsData) {
                const innerCode = action.innerCode;
                // исключаем звонки
                if (!innerCode.includes('call')) {
                    const actionValuebitrixId = action.actionItem.bitrixId;
                    const actionTypeValuebitrixId =
                        action.actionTypeItem.bitrixId;

                    // Формируем ключ команды, используя ID пользователя и ID действия для уникальности
                    const cmdKey = `user_${userId}_action_${action.code}`;

                    const getListData = {
                        IBLOCK_TYPE_ID: 'lists',
                        IBLOCK_ID: listId,
                        filter: {
                            [`${eventResponsibleFieldId}`]: userId,
                            [`${actionFieldId}`]: actionValuebitrixId,
                            [`${actionTypeFieldId}`]: actionTypeValuebitrixId,
                            [`${dateFieldForHookFrom}`]: dateFrom,
                            [`${dateFieldForHookTo}`]: dateTo,
                        },
                        select: ['ID'],
                    };

                    this.bitrixApi.addCmdBatch(
                        cmdKey,
                        'lists.element.get',
                        getListData,
                    );
                }
            }
        }
    };

    private proccesResultCommunications = (
        reportData: ReportData,
    ): ReportData => {
        const targetKpiItemResultPlan = {
            id: 'result_communication_plan' as string,
            count: 0,
        } as KPI;
        const targetKpiItemResultDone = {
            id: 'result_communication_done' as string,
            count: 0,
        } as KPI;

        reportData.kpi.forEach(kpi => {
            const isOriginalPlan =
                kpi.action.innerCode === EnumFilterInnerCode.call_plan ||
                kpi.action.innerCode === EnumFilterInnerCode.presentation_plan;
            const isOriginalDone =
                kpi.action.innerCode === EnumFilterInnerCode.call_done ||
                kpi.action.innerCode === EnumFilterInnerCode.presentation_done;

            if (isOriginalPlan) {
                targetKpiItemResultPlan.count += kpi.count;
            }
            if (isOriginalDone) {
                targetKpiItemResultDone.count += kpi.count;
            }
            if (kpi.action.innerCode === 'et_ork_call_ea_ork_plan') {
                targetKpiItemResultPlan.action = { ...kpi.action };
                targetKpiItemResultPlan.action.name = 'План';

                targetKpiItemResultPlan.action.innerCode = EnumFilterInnerCode.call_plan;
            }
            if (kpi.action.innerCode === 'et_ork_call_ea_ork_done') {
                targetKpiItemResultDone.action = { ...kpi.action };
                targetKpiItemResultDone.action.name = 'Результативные';
                targetKpiItemResultDone.action.innerCode = EnumFilterInnerCode.call_done;
            }
        });
        // reportData.kpi.unshift(
        //     targetKpiItemResultPlan,
        //     targetKpiItemResultDone,
        // );

        return reportData;
    };

    private getCalculateResults = (
        results: IBitrixBatchResponseResult[],
        departament: BXUserDto[],
        currentActionsData: Filter[],
    ): ReportData[] => {
        const report = [] as ReportData[];

        for (const user of departament) {
            const userId = user.ID;
            const userName = user.NAME + ' ' + user.LAST_NAME;

            let userReport = {
                user: user,
                userName: userName,
                kpi: [] as KPI[],
            } as ReportData;
            for (const action of currentActionsData) {
                const cmdKey = `user_${userId}_action_${action.code}`;
                const kpi = {
                    id: action.innerCode,
                    action: action,
                    count: 0,
                } as KPI;
                for (const result of results) {
                    for (const resultKey in result.result) {
                        if (resultKey === cmdKey) {
                            kpi.count =
                                Number(result.result_total[resultKey]) || 0;

                            userReport.kpi.push(kpi);
                        }
                    }
                }
            }
            userReport = this.proccesResultCommunications(
                userReport,
            ) as ReportData;
            report.push(userReport);
        }
        return report;
    };
}
