import type {
    IField,
    IFieldItem,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EnumSalesKpiFieldCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import type {
    Filter,
    FilterCode,
    FilterInnerCode,
} from '../../shared/dto/kpi.dto';
import { ActionService } from '../services/action.service';

/**
 * Сборка действий KPI-отчёта из списка «KPI» портала — общая для расчёта
 * отчёта (`ReportKpiUseCase`) и каталога показателей страницы «Настройки
 * отчёта»: колонки и их названия обязаны совпадать.
 */

/** Поля списка KPI, по которым строится отчёт; нет поля в слепке — null/undefined. */
export interface KpiListReportFields {
    eventAction: IField | null;
    eventActionType: IField | null;
    actionId?: string;
    actionTypeId?: string;
    eventResponsibleId?: string;
    dateFieldForHookFrom?: string;
    dateFieldForHookTo?: string;
}

/**
 * Поля отчёта в полях списка KPI — по коду поля. Повтор кода — берётся
 * последнее поле (как было в use-case).
 */
export function findKpiListReportFields(
    listFields: readonly IField[] | undefined,
): KpiListReportFields {
    const byCode = new Map<string, IField>();
    for (const field of listFields ?? []) {
        byCode.set(String(field.code), field);
    }
    const eventAction = byCode.get(EnumSalesKpiFieldCode.event_action) ?? null;
    const eventActionType =
        byCode.get(EnumSalesKpiFieldCode.event_type) ?? null;
    const responsible = byCode.get(EnumSalesKpiFieldCode.responsible);
    const eventDate = byCode.get(EnumSalesKpiFieldCode.event_date);
    return {
        eventAction,
        eventActionType,
        actionId: eventAction?.bitrixCamelId,
        actionTypeId: eventActionType?.bitrixCamelId,
        eventResponsibleId: responsible?.bitrixCamelId,
        dateFieldForHookFrom: eventDate && '>' + eventDate.bitrixCamelId,
        dateFieldForHookTo: eventDate && '<' + eventDate.bitrixCamelId,
    };
}

/**
 * Действия отчёта: каждое сочетание «тип события × действие», которое
 * `ActionService` распознаёт, по порядку колонок отчёта (`order`).
 */
export function buildReportActions(
    actionItems: IFieldItem[],
    actionTypeItems: IFieldItem[],
): Filter[] {
    const actions = [] as Filter[];
    const actionService = new ActionService();
    if (actionTypeItems.length && actionItems.length) {
        for (const actionType of actionTypeItems) {
            for (const action of actionItems) {
                const actionData = actionService.getActionWithTypeData(
                    actionType,
                    action,
                );
                if (actionData?.actionTypeItem && actionData?.actionItem) {
                    actions.push(actionData);
                }
            }
        }
    }
    return actions.sort((a, b) => a.order - b.order);
}

/** Колонки отчёта, которые сводят звонки и презентации в начало строки. */
export const REPORT_RESULT_COMMUNICATION_COLUMNS = {
    plan: {
        innerCode: 'result_communication_plan',
        name: 'План',
        sourceInnerCode: 'call_plan',
    },
    done: {
        innerCode: 'result_communication_done',
        name: 'Результативные',
        sourceInnerCode: 'call_done',
    },
} as const satisfies Record<
    'plan' | 'done',
    {
        innerCode: FilterInnerCode;
        name: string;
        sourceInnerCode: FilterInnerCode;
    }
>;

/** Коды действий «Звонок», по которым use-case запрашивает Битрикс. */
const REPORT_CALL_CODES: readonly FilterCode[] = ['call_plan', 'call_done'];

/**
 * Запрашивает ли расчёт отчёта это действие — тот же отбор, что в
 * `generateBatchCommands` use-case: не звонки — все; из звонков — только
 * `call_plan` и `call_done` (остальные типы «Звонка» добавляются к ним).
 */
export function isQueriedReportAction(
    action: Pick<Filter, 'innerCode' | 'code'>,
): boolean {
    const innerCode = action.innerCode;
    if (!innerCode.includes('call')) return true;
    const isCommunicationResult = innerCode.includes('result_communication');
    const isNoResult = innerCode.includes('noresult_communication');
    return (
        !isCommunicationResult &&
        !isNoResult &&
        REPORT_CALL_CODES.includes(action.code)
    );
}

/** Колонка таблицы событий: код показателя и название, как в отчёте. */
export interface ReportEventColumn {
    innerCode: string;
    name: string;
}

/**
 * Колонки строки отчёта в порядке отчёта: сначала «План» и
 * «Результативные» (есть, только если есть их звонок-источник), затем
 * действия, которые отчёт запрашивает (строка отчёта берёт действие, если
 * запрошен его код — `getCalculateResults` use-case).
 */
export function reportEventColumns(
    actions: readonly Filter[],
): ReportEventColumn[] {
    const queriedCodes = new Set(
        actions.filter(isQueriedReportAction).map(action => action.code),
    );
    const reported = actions.filter(action => queriedCodes.has(action.code));
    const synthetic = Object.values(REPORT_RESULT_COMMUNICATION_COLUMNS)
        .filter(column =>
            reported.some(
                action => action.innerCode === column.sourceInnerCode,
            ),
        )
        .map(({ innerCode, name }) => ({ innerCode, name }));
    return [
        ...synthetic,
        ...reported.map(action => ({
            innerCode: action.innerCode,
            name: action.name ?? '',
        })),
    ];
}

/**
 * Колонки событий по полям списка KPI портала. Нет списка или полей
 * действия и типа — колонок нет (отчёт на таком портале не строится).
 */
export function reportEventColumnsOfList(
    listFields: readonly IField[] | undefined,
): ReportEventColumn[] {
    const { eventAction, eventActionType } =
        findKpiListReportFields(listFields);
    if (!eventAction || !eventActionType) return [];
    return reportEventColumns(
        buildReportActions(
            eventAction.items ?? [],
            eventActionType.items ?? [],
        ),
    );
}
