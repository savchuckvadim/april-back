/**
 * Резолв полей списка sales_kpi по слепку портала для per-type батча
 * (канон kpi-report.use-case.ts: ключ фильтра — bitrixCamelId поля,
 * значения выпадающих списков — bitrixId элемента). Коды полей и
 * элементов — только из типизации portal-lib (ai/rules/pbx-typing.md).
 */
import {
    AI_ANALYTICS_EVENT_KINDS,
    AiAnalyticsKpiEventTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { EnumSalesKpiEventAction } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import { PBX_SALES_KPI_LIST_FIELD_CODES } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import { SALES_LIST_CODES } from '@lib/portal-lib/pbx/pbx-sales-list-reader/type/sales-list-record.type';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    IField,
    IPBXList,
} from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Код списка в слепке портала — прижат к сигнатуре PortalModel.getListByCode. */
type PortalListCode = Parameters<PortalModel['getListByCode']>[0];
export const SALES_KPI_LIST_CODE: PortalListCode = SALES_LIST_CODES.kpi;

/** Ошибка конфигурации портала: список/поле sales_kpi не настроены. */
export class KpiListConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'KpiListConfigError';
    }
}

export interface KpiListFields {
    listId: string;
    responsibleKey: string;
    actionKey: string;
    typeKey: string;
    dateKey: string;
    /** bitrixId элемента `done` поля event_action. */
    doneItemId: number;
    /** KPI-код → bitrixId элемента event_type (только настроенные на портале). */
    typeItemIds: ReadonlyMap<AiAnalyticsKpiEventTypeCode, number>;
}

/** Код элемента совпадает точно либо как суффикс полного `..._{code}`. */
export function itemCodeMatches(itemCode: string, code: string): boolean {
    return itemCode === code || itemCode.endsWith(`_${code}`);
}

function requireField(
    portal: PortalModel,
    list: IPBXList,
    shortCode: string,
): IField {
    const field = portal.getIdByCodeFieldList(list, shortCode);
    if (!field?.bitrixCamelId) {
        throw new KpiListConfigError(
            `Поле ${shortCode} списка sales_kpi не настроено на портале`,
        );
    }
    return field;
}

/** Поля и элементы списка sales_kpi из слепка портала; отсутствие — ошибка конфигурации. */
export function resolveKpiListFields(portal: PortalModel): KpiListFields {
    const list = portal.getListByCode(SALES_KPI_LIST_CODE);
    if (!list?.bitrixId) {
        throw new KpiListConfigError(
            'Список sales_kpi («ОП KPI») не настроен на портале',
        );
    }
    const codes = PBX_SALES_KPI_LIST_FIELD_CODES;
    const action = requireField(portal, list, codes.event_action);
    const type = requireField(portal, list, codes.event_type);
    const responsible = requireField(portal, list, codes.responsible);
    const date = requireField(portal, list, codes.event_date);

    const doneItem = (action.items ?? []).find(item =>
        itemCodeMatches(String(item.code), EnumSalesKpiEventAction.done),
    );
    if (!doneItem) {
        throw new KpiListConfigError(
            'Элемент «done» поля event_action списка sales_kpi не настроен на портале',
        );
    }

    const typeItemIds = new Map<AiAnalyticsKpiEventTypeCode, number>();
    for (const kind of Object.values(AI_ANALYTICS_EVENT_KINDS)) {
        for (const code of kind.kpiEventTypeCodes) {
            const item = (type.items ?? []).find(candidate =>
                itemCodeMatches(String(candidate.code), code),
            );
            if (item) typeItemIds.set(code, Number(item.bitrixId));
        }
    }

    return {
        listId: String(list.bitrixId),
        responsibleKey: responsible.bitrixCamelId,
        actionKey: action.bitrixCamelId,
        typeKey: type.bitrixCamelId,
        dateKey: date.bitrixCamelId,
        doneItemId: Number(doneItem.bitrixId),
        typeItemIds,
    };
}
