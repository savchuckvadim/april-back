/**
 * Резолв полей и справочников списка sales_kpi из слепка портала.
 *
 * Канон фильтров (выверен по kpi-report и SalesListReaderService):
 *  - ключ фильтра/select свойства — bitrixCamelId (PROPERTY_123);
 *  - значения выпадающих списков хранятся и фильтруются по bitrixId ЭЛЕМЕНТА;
 *  - в ответе lists.element.get значения лежат под bitrixCamelId (иногда под
 *    bitrixId) — читаем по обоим ключам.
 */
import type { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import type {
    IField,
    IFieldItem,
    IPBXList,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EnumSalesKpiFieldCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list.enum';
import { SALES_LIST_CODES } from '@lib/portal-lib/pbx/pbx-sales-list-reader/type/sales-list-record.type';
import type {
    KpiDigestCatalogDto,
    KpiDigestCatalogItemDto,
} from '../dto/digest-response.dto';
import { typeGroupOf } from './digest-type-group.util';

/** Список не настроен — считать нечего; ошибка громкая (как IncompleteBatch). */
export class DigestListConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DigestListConfigError';
    }
}

export interface DigestListField {
    /** Короткий код без префикса списка (event_type, plan_date…). */
    shortCode: string;
    /** Ключ фильтра и select — PROPERTY_N. */
    filterKey: string;
    /** Ключи, под которыми значение может лежать в ответе. */
    valueKeys: string[];
}

export interface DigestEnumItem {
    code: string;
    name: string;
    bitrixId: string;
}

export interface DigestListFields {
    listId: string;
    eventType: DigestListField;
    eventAction: DigestListField;
    eventDate: DigestListField;
    responsible: DigestListField;
    planDate?: DigestListField;
    comment?: DigestListField;
    resultStatus?: DigestListField;
    noresultReason?: DigestListField;
    crm?: DigestListField;
    crmCompany?: DigestListField;
    /** bitrixId элемента → item (резолв значений записи). */
    itemsByValue: {
        eventType: Map<string, DigestEnumItem>;
        eventAction: Map<string, DigestEnumItem>;
        resultStatus: Map<string, DigestEnumItem>;
        noresultReason: Map<string, DigestEnumItem>;
    };
    /** код → item (для фильтров по действию). */
    actionItemsByCode: Map<string, DigestEnumItem>;
    catalog: KpiDigestCatalogDto;
}

type PortalModelLike = Pick<PortalModel, 'getListByCode'>;

const listPrefix = (list: IPBXList): string => `${list.group}_${list.type}_`;

/** Код item'а без префикса списка (sales_kpi_presentation → presentation). */
function stripPrefix(list: IPBXList, code: string): string {
    const prefix = listPrefix(list);
    return code.startsWith(prefix) ? code.slice(prefix.length) : code;
}

function toField(list: IPBXList, field: IField): DigestListField {
    const camel = String(field.bitrixCamelId ?? '').trim();
    const raw = String(field.bitrixId ?? '').trim();
    const valueKeys = [...new Set([camel, raw].filter(Boolean))];
    return {
        shortCode: stripPrefix(list, String(field.code)),
        filterKey: camel || raw,
        valueKeys,
    };
}

function findField(
    list: IPBXList,
    code: EnumSalesKpiFieldCode,
): IField | undefined {
    return list.bitrixfields?.find(field => String(field.code) === code);
}

function toItems(list: IPBXList, field: IField | undefined): DigestEnumItem[] {
    const items: IFieldItem[] = field?.items ?? field?.bitrixfielditems ?? [];
    return items
        .filter(item => item.bitrixId !== undefined && item.bitrixId !== null)
        .map(item => ({
            code: stripPrefix(list, String(item.code ?? '')),
            name: String(item.name || item.title || item.code || ''),
            bitrixId: String(item.bitrixId),
        }));
}

const byValue = (items: DigestEnumItem[]): Map<string, DigestEnumItem> =>
    new Map(items.map(item => [item.bitrixId, item]));

const toCatalog = (items: DigestEnumItem[]): KpiDigestCatalogItemDto[] =>
    items.map(item => ({ code: item.code, name: item.name }));

/**
 * Поля и items списка sales_kpi. Четыре поля обязательны (тип, действие,
 * дата события, ответственный) — без них дайджест недостоверен; остальные
 * опциональны (нет поля — нет значения в записи).
 */
export function resolveDigestListFields(
    portalModel: PortalModelLike,
): DigestListFields {
    const list = portalModel.getListByCode(SALES_LIST_CODES.kpi);
    if (!list?.bitrixId) {
        throw new DigestListConfigError(
            'Список sales_kpi не настроен на портале — дайджест недоступен.',
        );
    }

    const required = (code: EnumSalesKpiFieldCode): DigestListField => {
        const field = findField(list, code);
        if (!field || !(field.bitrixCamelId || field.bitrixId)) {
            throw new DigestListConfigError(
                `В списке sales_kpi нет поля ${code} — дайджест недоступен.`,
            );
        }
        return toField(list, field);
    };
    const optional = (
        code: EnumSalesKpiFieldCode,
    ): DigestListField | undefined => {
        const field = findField(list, code);
        return field && (field.bitrixCamelId || field.bitrixId)
            ? toField(list, field)
            : undefined;
    };

    const eventTypeField = findField(list, EnumSalesKpiFieldCode.event_type);
    const eventActionField = findField(
        list,
        EnumSalesKpiFieldCode.event_action,
    );
    const typeItems = toItems(list, eventTypeField);
    const actionItems = toItems(list, eventActionField);
    const resultItems = toItems(
        list,
        findField(list, EnumSalesKpiFieldCode.op_result_status),
    );
    const reasonItems = toItems(
        list,
        findField(list, EnumSalesKpiFieldCode.op_noresult_reason),
    );

    return {
        listId: String(list.bitrixId),
        eventType: required(EnumSalesKpiFieldCode.event_type),
        eventAction: required(EnumSalesKpiFieldCode.event_action),
        eventDate: required(EnumSalesKpiFieldCode.event_date),
        responsible: required(EnumSalesKpiFieldCode.responsible),
        planDate: optional(EnumSalesKpiFieldCode.plan_date),
        comment: optional(EnumSalesKpiFieldCode.manager_comment),
        resultStatus: optional(EnumSalesKpiFieldCode.op_result_status),
        noresultReason: optional(EnumSalesKpiFieldCode.op_noresult_reason),
        crm: optional(EnumSalesKpiFieldCode.crm),
        crmCompany: optional(EnumSalesKpiFieldCode.crm_company),
        itemsByValue: {
            eventType: byValue(typeItems),
            eventAction: byValue(actionItems),
            resultStatus: byValue(resultItems),
            noresultReason: byValue(reasonItems),
        },
        actionItemsByCode: new Map(actionItems.map(item => [item.code, item])),
        catalog: {
            types: typeItems.map(item => ({
                code: item.code,
                name: item.name,
                group: typeGroupOf(item.code),
            })),
            actions: toCatalog(actionItems),
            noresultReasons: toCatalog(reasonItems),
        },
    };
}

/** Поля select для lists.element.get: системные + все известные свойства. */
export function digestSelectFields(fields: DigestListFields): string[] {
    const props = [
        fields.eventType,
        fields.eventAction,
        fields.eventDate,
        fields.responsible,
        fields.planDate,
        fields.comment,
        fields.resultStatus,
        fields.noresultReason,
        fields.crm,
        fields.crmCompany,
    ]
        .filter((field): field is DigestListField => !!field)
        .map(field => field.filterKey);
    return ['ID', 'NAME', 'DATE_CREATE', ...new Set(props)];
}
