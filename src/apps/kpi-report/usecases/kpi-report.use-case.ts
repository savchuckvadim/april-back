// report-kpi.service.ts
import { Injectable } from '@nestjs/common';
import { IField, IPBXList, IPortal, IFieldItem } from 'src/modules/portal/interfaces/portal.interface';

import { PortalModel } from 'src/modules/portal/services/portal.model';
import { BXUserDto, ReportGetFiltersDto } from '../dto/kpi-report-request.dto';
import { ReportData, Filter, KPI } from '../dto/kpi.dto';
import { ActionService } from '../services/kpi-report/action-service';
import { BitrixRequestApiService } from 'src/modules/bitrix/core/http/bitrix-request-api.service';
import { IBitrixBatchResponseResult } from 'src/modules/bitrix/core/interface/bitrix-api.intterface';
import { BitrixApiFactoryService } from 'src/modules/bitrix/core/queue/bitrix-api.factory.service';
import { PortalContextService } from 'src/modules/portal/services/portal-context.service';

@Injectable()
export class ReportKpiUseCase {
    // protected domain: string;
    protected portal: IPortal;
    protected portalKPIList?: IPBXList;
    protected portalHistoryList?: IPBXList;
    protected hook: string;
    private portalModel: PortalModel;
    // private bitrixApi: BitrixApiService;

    constructor(

        private readonly portalContext: PortalContextService,
        private readonly bitrixApi: BitrixRequestApiService, // scope: REQUEST
        // private readonly bxFactory: BitrixApiFactoryService // scope: QUEUE
    ) {



    }

    async init(domain: string) {
        // this.domain = domain;
        this.portalModel = this.portalContext.getModel();
        const portal = this.portalModel.getPortal();


        //for queue
        // this.portalModel = await this.portalProvider.getModelByDomain(domain);
        // const portal = this.portalModel.getPortal();

        if (!portal) throw new Error('Portal not found');

        // //for queue
        // this.bitrixApi = await this.bxFactory.create(portal)


        this.portal = portal;
        this.hook = this.portalModel.getHook();

        this.portalKPIList = this.portalModel.getListByCode('sales_kpi');
        this.portalHistoryList = this.portalModel.getListByCode('sales_history');


    }

    async generateKpiReport(dto: ReportGetFiltersDto): Promise<ReportData[]> {
        // const bitrixApi = this.bitrixContext.getApi();

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
        } = this.getPbxFiledsData().fields


        const currentActionsData = this.getActionsData(eventAction.items, eventActionType.items) as Filter[];


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
            listId as string
        )
        // const commandsResult = bitrixApi.getCmdBatch();
        const results = await this.bitrixApi.callBatchWithConcurrency(3);
        const report = this.getCalculateResults(results, departament, currentActionsData)



        return report;
    }

    private getPbxFiledsData = (): {
        fields: {
            eventAction: IField
            eventActionType: IField
            actionId: string
            actionTypeId: string
            eventResponsibleId: string
            // eventDateId: string
            dateFieldForHookFrom: string
            dateFieldForHookTo: string
        }
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
                switch (plField.code) {
                    case 'sales_kpi_event_action':
                        eventActionField = plField as IField;
                        actionFieldId = plField.bitrixCamelId;
                        break;

                    case 'sales_kpi_event_type':
                        eventActionTypeField = plField;
                        actionTypeFieldId = plField.bitrixCamelId;
                        break;

                    case 'sales_kpi_responsible':
                        // eventResponsibleField = plField;
                        eventResponsibleFieldId = plField.bitrixCamelId;
                        break;

                    case 'sales_kpi_event_date':
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
            }
        }
    }
    private getActionsData = (

        actionItems: IFieldItem[],
        actionTypeItems: IFieldItem[]

    ): Filter[] => {
        const currentActionsData = [] as Filter[];
        const actionService = new ActionService();
        if (actionTypeItems.length && actionItems.length) {
            for (const actionType of actionTypeItems) {
                for (const action of actionItems) {
                    const actionData = actionService.getActionWithTypeData(actionType, action);
                    if (
                        actionData?.actionTypeItem &&
                        actionData?.actionItem
                    ) {
                        currentActionsData.push(actionData);

                    }
                }
            }
        }

        return currentActionsData.sort((a, b) => a.order - b.order);

    }

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

            const userId = user.ID



            for (const action of currentActionsData) {
                const innerCode = action.innerCode;

                // если это обычный звонок, не результативный и не нерезультативный
                const isCommunicationResult = innerCode.includes('result_communication');
                const isNoResult = innerCode.includes('noresult_communication');
                const isCall = innerCode.includes('call');

                if (!isCommunicationResult && !isNoResult && isCall) {
                    const actionValuebitrixId = action.actionItem.bitrixId;
                    const actionTypeValuebitrixId = action.actionTypeItem.bitrixId;
                    const cmdKey = `user_${userId}_action_${action.code}`;
                    if (action.code == 'call_plan') {
                        const getListData = {
                            IBLOCK_TYPE_ID: 'lists',
                            IBLOCK_ID: listId,
                            filter: {
                                [`${eventResponsibleFieldId}`]: userId,
                                [`${actionFieldId}`]: actionValuebitrixId,
                                [`${actionTypeFieldId}`]: [actionTypeValuebitrixId] as string[] | number[],
                                [`${dateFieldForHookFrom}`]: dateFrom,
                                [`${dateFieldForHookTo}`]: dateTo,
                            },
                            select: ['ID']
                        };

                        for (const callPlanAction of currentActionsData) {

                            if (callPlanAction.code == 'xo_plan' ||
                                callPlanAction.code == 'call_in_money_plan' ||
                                callPlanAction.code == 'call_in_progress_plan'
                            ) {
                                const actionTypeArray = getListData.filter[`${actionTypeFieldId}`] as (string | number)[];
                                actionTypeArray.push(callPlanAction.actionTypeItem.bitrixId as string | number);
                            }
                        }

                        this.bitrixApi.addCmdBatch(cmdKey, 'lists.element.get', getListData);
                    }

                    if (action.code == 'call_done') {
                        const getListData = {
                            IBLOCK_TYPE_ID: 'lists',
                            IBLOCK_ID: listId,
                            filter: {
                                [`${eventResponsibleFieldId}`]: userId,
                                [`${actionFieldId}`]: actionValuebitrixId,
                                [`${actionTypeFieldId}`]: [actionTypeValuebitrixId] as string[] | number[],
                                [`${dateFieldForHookFrom}`]: dateFrom,
                                [`${dateFieldForHookTo}`]: dateTo,
                            },
                            select: ['ID']
                        };

                        for (const callDoneAction of currentActionsData) {

                            if (callDoneAction.code == 'xo_done' ||
                                callDoneAction.code == 'call_in_money_done' ||
                                callDoneAction.code == 'call_in_progress_done'
                            ) {
                                const actionTypeArray = getListData.filter[`${actionTypeFieldId}`] as (string | number)[];
                                actionTypeArray.push(callDoneAction.actionTypeItem.bitrixId as string | number);
                            }
                        }

                        this.bitrixApi.addCmdBatch(cmdKey, 'lists.element.get', getListData);
                    }

                }




            }

            for (const action of currentActionsData) {
                const innerCode = action.innerCode;
                // исключаем звонки
                if (!innerCode.includes('call')) {
                    const actionValuebitrixId = action.actionItem.bitrixId;
                    const actionTypeValuebitrixId = action.actionTypeItem.bitrixId;

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
                        select: ['ID']
                    };


                    this.bitrixApi.addCmdBatch(cmdKey, 'lists.element.get', getListData);
                }

            }



        }

    }


    private proccesResultCommunications = (reportData: ReportData): ReportData => {


        const targetKpiItemResultPlan = { id: 'result_communication_plan' as string, count: 0 } as KPI;
        const targetKpiItemResultDone = { id: 'result_communication_done' as string, count: 0 } as KPI;
        // const resultKpiPlan = {

        //     action: {
        //         actionItem: kpi.action.actionItem!,
        //         actionTypeItem: kpi.action.actionTypeItem!,
        //         innerCode: 'result_communication_plan' as FilterInnerCode,
        //         code: 'call_done' as FilterCode,
        //         name: 'Запланированные коммуникации',
        //     },
        // } as KPI;

        // const resultKpiDone = {

        //     action: {
        //         actionItem: kpi.action.actionItem!,
        //         actionTypeItem: kpi.action.actionTypeItem!,
        //         innerCode: 'result_communication_done' as FilterInnerCode,
        //         code: 'call_done' as FilterCode,
        //         name: 'Результативные Коммуникации',
        //     },
        // } as KPI;
        reportData.kpi.forEach(kpi => {

            const isOriginalPlan = kpi.action.innerCode === 'call_plan' || kpi.action.innerCode === 'presentation_plan';
            const isOriginalDone = kpi.action.innerCode === 'call_done' || kpi.action.innerCode === 'presentation_done';

            if (isOriginalPlan) {
                targetKpiItemResultPlan.count += kpi.count;
            }
            if (isOriginalDone) {
                targetKpiItemResultDone.count += kpi.count;
            }
            if (kpi.action.innerCode === 'call_plan') {
                targetKpiItemResultPlan.action = { ...kpi.action };
                targetKpiItemResultPlan.action.name = 'План'

                targetKpiItemResultPlan.action.innerCode = 'result_communication_plan'
            }
            if (kpi.action.innerCode === 'call_done') {
                targetKpiItemResultDone.action = { ...kpi.action };
                targetKpiItemResultDone.action.name = 'Результативные'
                targetKpiItemResultDone.action.innerCode = 'result_communication_done'
            }




        });
        reportData.kpi.unshift(targetKpiItemResultPlan, targetKpiItemResultDone);


        return reportData;
    }

    private getCalculateResults = (
        results: IBitrixBatchResponseResult[],
        departament: BXUserDto[],
        currentActionsData: Filter[]
    ): ReportData[] => {
        const report = [] as ReportData[];

        for (const user of departament) {

            const userId = user.ID
            const userName = user.NAME + ' ' + user.LAST_NAME

            let userReport = {
                user: user,
                userName: userName,
                kpi: [] as KPI[]
            } as ReportData
            for (const action of currentActionsData) {

                const cmdKey = `user_${userId}_action_${action.code}`;
                const kpi = {
                    id: action.innerCode,
                    action: action,
                    count: 0,

                } as KPI
                for (const result of results) {
                    for (const resultKey in result.result) {
                        if (resultKey === cmdKey) {


                            kpi.count = Number(result.result_total[resultKey]) || 0

                            userReport.kpi.push(kpi)

                        }
                    }


                }
            }
            userReport = this.proccesResultCommunications(userReport) as ReportData
            report.push(userReport)
        }
        return report;
    }


}
