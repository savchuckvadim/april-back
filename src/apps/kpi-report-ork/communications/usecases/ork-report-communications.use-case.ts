// report-kpi.service.ts

import {
    IField,
    IPBXList,
    IPortal,
    IFieldItem,
} from 'src/modules/portal/interfaces/portal.interface';
import { PortalModel } from 'src/modules/portal/services/portal.model';

import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { EnumOrkEventAction, EnumOrkEventCommunication, EnumOrkEventInitiative, EnumOrkEventType, EnumOrkFieldCode } from '@/modules/pbx-ork-history-bx-list';
import { PBXService } from '@/modules/pbx';
import { BitrixBaseApi, BitrixService } from '@/modules/bitrix';
import { CommunicationsReportData, FilterCommunication, KPICommunication } from '../dto/communications.dto';
import { OrkReportCommunicationItems } from '../type/ork-report-communications.type';
import { BXUserDto } from '../../event/dto/get-report-request.dto';
import { ReportGetCommunicationsFiltersDto } from '../dto/get-report-communications-request.dto';

export class ReportCommunicationsUseCase {
    // protected domain: string;
    protected portal: IPortal;
    protected portalKPIList?: IPBXList;
    protected hook: string;
    private portalModel: PortalModel;
    private bitrix: BitrixService;
    private bitrixApi: BitrixBaseApi;

    constructor(

        private readonly pbx: PBXService,
    ) { }

    async init(domain: string) {

        const { portal, PortalModel, bitrix } = await this.pbx.init(domain);


        if (!portal) throw new Error('Portal not found');

        // //for queue
        this.portalModel = PortalModel;
        this.bitrix = bitrix;
        this.bitrixApi = bitrix.api;

        this.portal = portal;
        this.hook = PortalModel.getHook();

        this.portalKPIList = this.portalModel.getListByCode('service_ork_history');

    }

    async generateKpiReport(domain: string, dto: ReportGetCommunicationsFiltersDto): Promise<CommunicationsReportData[]> {
        // const bitrixApi = this.bitrixContext.getApi();
        await this.init(domain);
        const departament = dto.departament;
        const dateFrom = dto.dateFrom;
        const dateTo = dto.dateTo;

        const listId = this.portalKPIList?.bitrixId;
        // const listFields = this.portalKPIList?.bitrixfields;
        const {
            eventAction,
            communicationItem,
            initiativeItem,
            actionId,
            communicationFieldId,
            initiativeFieldId,
            eventResponsibleId,
            // eventDateId,
            dateFieldForHookFrom,
            dateFieldForHookTo,
        } = this.getPbxFiledsData().fields;

        const currentActionsData = this.getActionsData(
            eventAction?.items,
            communicationItem?.items,
            initiativeItem?.items,
        ) as FilterCommunication[];

        this.generateBatchCommands(
            departament,
            currentActionsData,
            eventResponsibleId,
            actionId,
            communicationFieldId,
            initiativeFieldId,

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
            communicationItem: IField;
            initiativeItem: IField;
            actionId: string;
            communicationFieldId: string;
            initiativeFieldId: string;
            eventResponsibleId: string;
            // eventDateId: string
            dateFieldForHookFrom: string;
            dateFieldForHookTo: string;
        };
    } => {
        const listFields = this.portalKPIList?.bitrixfields;

        let eventActionField = null as IField | null;
        let eventCommunicationField = null as IField | null;
        let eventInitiativeField = null as IField | null;

        let actionFieldId: string | undefined;
        let communicationFieldId: string | undefined;
        let initiativeFieldId: string | undefined;
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

                    case EnumOrkFieldCode.event_communication:
                        eventCommunicationField = plField as IField;
                        communicationFieldId = plField.bitrixCamelId;
                        break;

                    case EnumOrkFieldCode.ork_event_initiative:
                        eventInitiativeField = plField as IField;
                        initiativeFieldId = plField.bitrixCamelId;
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
                communicationItem: eventCommunicationField as IField,
                initiativeItem: eventInitiativeField as IField,
                actionId: actionFieldId as string,
                communicationFieldId: communicationFieldId as string,
                initiativeFieldId: initiativeFieldId as string,
                eventResponsibleId: eventResponsibleFieldId as string,
                // eventDateId: eventDateFieldId as string,
                dateFieldForHookFrom: dateFieldForHookFrom as string,
                dateFieldForHookTo: dateFieldForHookTo as string,
            },
        };
    };
    private getActionsData = (
        actionItems: IFieldItem[] | undefined,
        communicationItemItems: IFieldItem[] | undefined,
        initiativeItemItems: IFieldItem[] | undefined,
    ): FilterCommunication[] => {
        const currentActionsData = [] as FilterCommunication[];
        // const actionService = new ActionOrkEventService();
        if (!communicationItemItems || !actionItems || !initiativeItemItems) {
            return currentActionsData;
        }
        let order = 0;
        if (communicationItemItems.length && actionItems.length && initiativeItemItems.length) {
            for (const communicationItem of communicationItemItems) {
                for (const initiativeItem of initiativeItemItems) {
                    for (const action of actionItems) {

                        const actionCode = action.code as EnumOrkEventAction;
                        const incomingCode = initiativeItem.code as EnumOrkEventInitiative;
                        const communicationCode = communicationItem.code as EnumOrkEventCommunication;

                        const communicationSctionItems = OrkReportCommunicationItems[actionCode]
                        if (!communicationSctionItems) continue;
                        const communicationInitiativeItems = communicationSctionItems[incomingCode];
                        if (!communicationInitiativeItems) continue;
                        const initDataItem = communicationInitiativeItems[communicationCode];
                        if (!initDataItem) continue;


                        order++;
                        const item: FilterCommunication = {
                            code: initDataItem.code,
                            innerCode: initDataItem.code,
                            name: initDataItem.name,
                            actionItem: action,
                            communicationItem: communicationItem,
                            initiativeItem: initiativeItem,
                            order
                        }
                        currentActionsData.push(item);
                    }
                }
            }

            return currentActionsData.sort((a, b) => a.order - b.order);
        }
        return currentActionsData;
    }
    private generateBatchCommands = (
        departament: BXUserDto[],
        currentActionsData: FilterCommunication[],
        eventResponsibleFieldId: string,

        actionFieldId: string,
        communicationFieldId: string,
        initiativeFieldId: string,
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
                // исключаем звонки
                if (!innerCode.includes('call')) {
                    const actionValuebitrixId = action.actionItem.bitrixId;
                    const communicationValuebitrixId =
                        action.communicationItem.bitrixId;
                    const initiativeValuebitrixId =
                        action.initiativeItem.bitrixId;

                    // Формируем ключ команды, используя ID пользователя и ID действия для уникальности
                    const cmdKey = `user_${userId}_action_${action.code}`;

                    const getListData = {
                        IBLOCK_TYPE_ID: 'lists',
                        IBLOCK_ID: listId,
                        filter: {
                            [`${eventResponsibleFieldId}`]: userId,
                            [`${actionFieldId}`]: actionValuebitrixId,
                            [`${communicationFieldId}`]: communicationValuebitrixId,
                            [`${initiativeFieldId}`]: initiativeValuebitrixId,

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


    private getCalculateResults = (
        results: IBitrixBatchResponseResult[],
        departament: BXUserDto[],
        currentActionsData: FilterCommunication[],
    ): CommunicationsReportData[] => {
        const report = [] as CommunicationsReportData[];

        for (const user of departament) {
            const userId = user.ID;
            const userName = user.NAME + ' ' + user.LAST_NAME;

            let userReport = {
                user: user,
                userName: userName,
                kpi: [] as KPICommunication[],
            } as CommunicationsReportData;
            for (const action of currentActionsData) {
                const cmdKey = `user_${userId}_action_${action.code}`;
                const kpi = {
                    id: action.innerCode,
                    action: action,
                    count: 0,
                } as KPICommunication;
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

            report.push(userReport);
        }
        return report;
    };
}
