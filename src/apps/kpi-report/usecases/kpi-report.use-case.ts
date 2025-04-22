// report-kpi.service.ts
import { Injectable } from '@nestjs/common';
import { BitrixContextService } from 'src/modules/bitrix/services/bitrix-context.service';
import { IField, IPBXList, IPortal, IFieldItem } from 'src/modules/portal/interfaces/portal.interface';
import { PortalContextService } from 'src/modules/portal/services/portal-context.service';

import { PortalModel } from 'src/modules/portal/services/portal.model';
import { ReportRequestDto } from '../dto/kpi-report-request.dto';
import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
import { ReportData, Filter, FilterCode, FilterInnerCode } from '../dto/kpi.dto';
import { ActionService } from '../services/action-service';

@Injectable()
export class ReportKpiUseCase {
    protected domain: string;
    protected portal: IPortal;
    protected portalKPIList?: IPBXList;
    protected portalHistoryList?: IPBXList;
    protected hook: string;

    constructor(
        private readonly portalModel: PortalModel,
        private readonly bitrixContext: BitrixContextService,
        private readonly portalContext: PortalContextService,
        private readonly portalProvider: PortalProviderService,
    ) { }

    async init(domain: string) {
        this.domain = domain;

        // const portalResponse = await this.portalService.getPortal(domain);
        const portal = this.portalModel.getPortal();

        if (!portal) throw new Error('Portal not found');

        this.portal = portal;
        this.hook = this.portalModel.getHook();

        const bitrixLists = portal.lists || [];

        for (const bitrixList of bitrixLists) {
            if (bitrixList.type === 'kpi') {
                this.portalKPIList = bitrixList;
            }
            if (bitrixList.type === 'history') {
                this.portalHistoryList = bitrixList;
            }
        }
    }
    async generateKpiReport(dto: ReportRequestDto): Promise<ReportData[]> {
        const bitrixApi = this.bitrixContext.getApi();

        const departament = dto.filters.departament;
        const dateFrom = dto.filters.dateFrom;
        const dateTo = dto.filters.dateTo;

        const listId = this.portalKPIList?.bitrixId;
        const listFields = this.portalKPIList?.bitrixfields;

        let eventActionField = null as IField | null;
        let eventActionTypeField = null as IField | null;
        let eventResponsibleField = null as IField | null;
        let eventDateField = null as IField | null;

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
                        eventActionField = plField;
                        actionFieldId = plField.bitrixCamelId;
                        break;

                    case 'sales_kpi_event_type':
                        eventActionTypeField = plField;
                        actionTypeFieldId = plField.bitrixCamelId;
                        break;

                    case 'sales_kpi_responsible':
                        eventResponsibleField = plField;
                        eventResponsibleFieldId = plField.bitrixCamelId;
                        break;

                    case 'sales_kpi_event_date':
                        eventDateField = plField;
                        eventDateFieldId = plField.bitrixCamelId;
                        dateFieldForHookFrom = '>' + eventDateFieldId;
                        dateFieldForHookTo = '<' + eventDateFieldId;
                        break;
                }
            }
        }

        const currentActionsData = [] as Filter[];
        const actionService = new ActionService();
        if (eventActionTypeField?.items?.length && eventActionField?.items?.length) {
            for (const actionType of eventActionTypeField.items) {
                for (const action of eventActionField.items) {
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

        const commands = {
            'get_action': 'crm.activity.get',
            'get_action_type': 'crm.activity.type.get',
        };

        for (const [key, command] of Object.entries(commands)) {
            bitrixApi.addCmdBatch(key, command, {});
        }

        const results = await bitrixApi.callBatchAsync();

        // Обрабатываем результаты
        const report = [] as ReportData[];
        for (const userReport of report) {
            let resultKpiDoneCount = 0;
            let resultKpiPlanCount = 0;

            let actionItem: IFieldItem | undefined;
            let actionTypeItem: IFieldItem | undefined;

            for (const kpi of userReport.kpi) {
                const isDone = ['call_done', 'presentation_done'].includes(kpi.action.code);
                const isPlan = ['call_plan', 'presentation_plan'].includes(kpi.action.code);

                if (isDone) {
                    resultKpiDoneCount += kpi.count;
                    actionItem = kpi.action?.actionItem;
                    actionTypeItem = kpi.action?.actionTypeItem;
                }

                if (isPlan) {
                    resultKpiPlanCount += kpi.count;
                    actionItem = kpi.action?.actionItem || [];
                    actionTypeItem = kpi.action?.actionTypeItem || [];
                }
            }

            const resultKpiPlan = {
                id: 0,
                count: resultKpiPlanCount,
                action: {
                    actionItem: actionItem!,
                    actionTypeItem: actionTypeItem!,
                    innerCode: 'result_communication_plan' as FilterInnerCode,
                    code: 'call_done' as FilterCode,
                    name: 'Запланированные коммуникации',
                },
            };

            const resultKpiDone = {
                id: 1,
                count: resultKpiDoneCount,
                action: {
                    actionItem: actionItem!,
                    actionTypeItem: actionTypeItem!,
                    innerCode: 'result_communication_done' as FilterInnerCode,
                    code: 'call_done' as FilterCode,
                    name: 'Результативные Коммуникации',
                },
            };

            userReport.kpi.unshift(resultKpiPlan, resultKpiDone);
        }

        return report;
    }


}
