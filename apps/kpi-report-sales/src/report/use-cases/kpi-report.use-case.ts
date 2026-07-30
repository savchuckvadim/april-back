// report-kpi.service.ts

import {
    IField,
    IPBXList,
    IPortal,
    IFieldItem,
} from '@lib/portal-lib/portal/interfaces/portal.interface';

import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BXUserDto, ReportGetFiltersDto } from '../dto/kpi-report-request.dto';
import { ReportData, Filter, KPI } from '../../shared/dto/kpi.dto';
import { ActionService } from '../services/action.service';
import { PBXService } from '@/modules/pbx';
import { BitrixBaseApi } from '@/modules/bitrix';
import {
    assertBatchComplete,
    mergeBatchResults,
    MergedBatchResults,
} from '../../shared/lib/batch-completeness.util';
import {
    normalizeReportPeriod,
    NormalizedReportPeriod,
} from '../../shared/lib/date-util';
import { ReportResultCacheService } from '../cache/report-result-cache.service';
import {
    buildKpiReportResultKey,
    buildReportUsersKey,
} from '../cache/report-cache-key.util';
import {
    KPI_REPORT_CACHE_APP,
    KPI_RESULT_TTL_SECONDS,
} from '../constants/report-queue.const';

/**
 * KPI-отчёт отдела продаж: батч lists.element.get (сотрудник × действие),
 * счётчики из result_total.
 *
 * Громкие ошибки: strict-батч + assertBatchComplete — пропавшая команда
 * (дроп rate-limiter) роняет расчёт, а не тихо занижает показатели.
 * Кардинальность фиксирована: у каждого сотрудника KPI по каждому
 * сгенерированному действию (count 0 при нуле).
 *
 * Даты нормализуются к ISO (легаси DD.MM.YYYY и канон YYYY-MM-DD дают
 * одинаковые фильтры и один ключ кэша).
 *
 * НЕ Injectable: `new ReportKpiUseCase()` + init(domain, pbx, cache?)
 * per-domain (правило CLAUDE.md). cache — write-through конверта результата.
 */
export class ReportKpiUseCase {
    protected portal: IPortal;
    protected portalKPIList?: IPBXList;
    protected portalHistoryList?: IPBXList;
    protected hook: string;
    private portalModel: PortalModel;
    private bitrixApi: BitrixBaseApi;
    private domain: string;
    private cache?: ReportResultCacheService;

    async init(
        domain: string,
        pbx: PBXService,
        cache?: ReportResultCacheService,
    ) {
        const { portal, PortalModel, bitrix } = await pbx.init(domain);
        this.portalModel = PortalModel;

        if (!portal) throw new Error('Portal not found');

        this.bitrixApi = bitrix.api;
        this.portal = portal;
        this.domain = domain;
        this.cache = cache;
        this.hook = this.portalModel.getHook();

        this.portalKPIList = this.portalModel.getListByCode('sales_kpi');
        this.portalHistoryList =
            this.portalModel.getListByCode('sales_history');
    }

    async generateKpiReport(dto: ReportGetFiltersDto): Promise<ReportData[]> {
        const departament = dto.departament;
        const period = normalizeReportPeriod(dto.dateFrom, dto.dateTo);

        const listId = this.portalKPIList?.bitrixId;
        const {
            eventAction,
            eventActionType,
            actionId,
            actionTypeId,
            eventResponsibleId,
            dateFieldForHookFrom,
            dateFieldForHookTo,
        } = this.getPbxFiledsData().fields;

        const currentActionsData = this.getActionsData(
            eventAction.items,
            eventActionType.items,
        );

        // Легаси-запрос шлёт в фильтры исходные строки (байт-в-байт как
        // прод), канон — ISO; см. NormalizedReportPeriod.bitrixFrom.
        const expectedKeys = this.generateBatchCommands(
            departament,
            currentActionsData,
            eventResponsibleId,
            actionId,
            actionTypeId,
            dateFieldForHookFrom,
            dateFieldForHookTo,
            period.bitrixFrom,
            period.bitrixTo,
            listId as string,
        );
        const results = await this.bitrixApi.callBatchWithConcurrency(1, {
            strict: true,
        });
        const merged = mergeBatchResults(results);
        assertBatchComplete(merged, expectedKeys, 'KPI-отчёт');

        const report = this.getCalculateResults(
            merged,
            new Set(expectedKeys),
            departament,
            currentActionsData,
        );
        await this.writeCache(period, departament, report);
        return report;
    }

    /** Write-through конверта результата (воркер, легаси-sync, снапшот). */
    private async writeCache(
        period: NormalizedReportPeriod,
        departament: BXUserDto[],
        report: ReportData[],
    ): Promise<void> {
        if (!this.cache) return;
        const usersKey = buildReportUsersKey(departament.map(user => user.ID));
        await this.cache.setReady(
            KPI_REPORT_CACHE_APP,
            this.domain,
            buildKpiReportResultKey(
                period.fromIso,
                period.toIsoInclusive,
                usersKey,
            ),
            report,
            // Транспортный буфер доставки очереди, не кэш (2026-07-30)
            KPI_RESULT_TTL_SECONDS,
        );
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
            },
        };
    };
    private getActionsData = (
        actionItems: IFieldItem[],
        actionTypeItems: IFieldItem[],
    ): Filter[] => {
        const currentActionsData = [] as Filter[];
        const actionService = new ActionService();
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

    /**
     * Генерирует батч-команды и возвращает СПИСОК ОЖИДАЕМЫХ cmdKey —
     * единственный источник истины для контроля полноты результата и
     * фиксированной кардинальности отчёта.
     */
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
    ): string[] => {
        const expectedKeys: string[] = [];
        for (const user of departament) {
            const userId = user.ID;

            for (const action of currentActionsData) {
                const innerCode = action.innerCode;

                // если это обычный звонок, не результативный и не нерезультативный
                const isCommunicationResult = innerCode.includes(
                    'result_communication',
                );
                const isNoResult = innerCode.includes('noresult_communication');
                const isCall = innerCode.includes('call');

                if (!isCommunicationResult && !isNoResult && isCall) {
                    const actionValuebitrixId = action.actionItem.bitrixId;
                    const actionTypeValuebitrixId =
                        action.actionTypeItem.bitrixId;
                    const cmdKey = `user_${userId}_action_${action.code}`;
                    if (action.code == 'call_plan') {
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
                                callPlanAction.code == 'xo_plan' ||
                                callPlanAction.code == 'call_in_money_plan' ||
                                callPlanAction.code == 'call_in_progress_plan'
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
                        expectedKeys.push(cmdKey);
                    }

                    if (action.code == 'call_done') {
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
                                callDoneAction.code == 'xo_done' ||
                                callDoneAction.code == 'call_in_money_done' ||
                                callDoneAction.code == 'call_in_progress_done'
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
                        expectedKeys.push(cmdKey);
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
                    expectedKeys.push(cmdKey);
                }
            }
        }
        return expectedKeys;
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
            const isOriginalPlan =
                kpi.action.innerCode === 'call_plan' ||
                kpi.action.innerCode === 'presentation_plan';
            const isOriginalDone =
                kpi.action.innerCode === 'call_done' ||
                kpi.action.innerCode === 'presentation_done';

            if (isOriginalPlan) {
                targetKpiItemResultPlan.count += kpi.count;
            }
            if (isOriginalDone) {
                targetKpiItemResultDone.count += kpi.count;
            }
            if (kpi.action.innerCode === 'call_plan') {
                targetKpiItemResultPlan.action = { ...kpi.action };
                targetKpiItemResultPlan.action.name = 'План';

                targetKpiItemResultPlan.action.innerCode =
                    'result_communication_plan';
            }
            if (kpi.action.innerCode === 'call_done') {
                targetKpiItemResultDone.action = { ...kpi.action };
                targetKpiItemResultDone.action.name = 'Результативные';
                targetKpiItemResultDone.action.innerCode =
                    'result_communication_done';
            }
        });
        reportData.kpi.unshift(
            targetKpiItemResultPlan,
            targetKpiItemResultDone,
        );

        return reportData;
    };

    /**
     * Сборка отчёта из СЛИТЫХ результатов: KPI создаётся для каждого
     * сгенерированного действия (expectedKeys — источник истины), счётчик
     * из result_total, count 0 при нуле. Раньше пропавший ключ молча
     * СЖИМАЛ список KPI — теперь кардинальность фиксирована (полнота
     * гарантирована assertBatchComplete выше).
     */
    private getCalculateResults = (
        merged: MergedBatchResults,
        expectedKeys: ReadonlySet<string>,
        departament: BXUserDto[],
        currentActionsData: Filter[],
    ): ReportData[] => {
        const report = [] as ReportData[];

        for (const user of departament) {
            const userId = user.ID;
            const userName = user.NAME + ' ' + user.LAST_NAME;

            let userReport = {
                id: Number(userId),
                user: user,
                userName: userName,
                kpi: [] as KPI[],
            } as ReportData;
            for (const action of currentActionsData) {
                const cmdKey = `user_${userId}_action_${action.code}`;
                if (!expectedKeys.has(cmdKey)) continue;
                userReport.kpi.push({
                    id: action.innerCode,
                    action: action,
                    count: Number(merged.totals[cmdKey]) || 0,
                } as KPI);
            }
            userReport = this.proccesResultCommunications(userReport);
            report.push(userReport);
        }
        return report;
    };
}
