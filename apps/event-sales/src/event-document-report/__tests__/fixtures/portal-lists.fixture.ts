/**
 * Фейковые списки портала: «ОП KPI», «ОП История» и «Презентации» с полями и вариантами.
 */
import {
    PBX_SALES_PRESENTATION_LIST_FIELD_CODES,
    PBX_SALES_PRESENTATION_LIST_ITEM_CODES,
} from '@lib/portal-lib/pbx/pbx-sales-presentation-list/pbx-sales-presentation-list.const';

// === Списки портала ===
export interface FakeListFieldItem {
    code: string;
    bitrixId: number;
}

export interface FakeListField {
    code: string;
    bitrixCamelId: string;
    items?: FakeListFieldItem[];
}

export interface FakeList {
    group: string;
    type: string;
    bitrixId: number;
    bitrixfields: FakeListField[];
}

export type KpiListType = 'kpi' | 'history';

export const KPI_IBLOCK_ID = 55;
export const HISTORY_IBLOCK_ID = 56;
export const PRESENTATION_IBLOCK_ID = 77;

/** IBLOCK_ID списка «ОП KPI» или «ОП История» в виде, как его шлют в Битрикс. */
export const kpiIblockId = (type: KpiListType): string =>
    String(type === 'kpi' ? KPI_IBLOCK_ID : HISTORY_IBLOCK_ID);

/** Ключ свойства списка KPI/истории: у фейков `P_<ТИП>_<КОД>`. */
export const listFieldKey = (type: KpiListType, code: string): string =>
    `P_${type.toUpperCase()}_${code.toUpperCase()}`;

const KPI_EVENT_TYPE_ITEMS = [
    'ev_offer',
    'ev_offer_pres',
    'ev_invoice',
    'ev_invoice_pres',
    'ev_contract',
    'ev_supply',
] as const;
/** bitrixId варианта поля «Тип события» на фейковых списках KPI/истории. */
export const kpiEventTypeItemId = (code: string): number =>
    (KPI_EVENT_TYPE_ITEMS as readonly string[]).indexOf(code) + 1;

const KPI_EVENT_ACTION_ITEMS = ['act_send', 'done'] as const;
const KPI_SCALAR_FIELDS = [
    'event_date',
    'event_title',
    'author',
    'responsible',
    'su',
    'crm',
    'crm_company',
    'manager_comment',
] as const;

const makeListItems = (codes: readonly string[]): FakeListFieldItem[] =>
    codes.map((code, index) => ({ code, bitrixId: index + 1 }));

export interface SalesListsOptions {
    /** Варианты поля «Тип события», которых на портале нет. */
    missingEventTypes?: readonly string[];
}

const makeKpiList = (
    type: KpiListType,
    options: SalesListsOptions,
): FakeList => {
    const enumeration = (
        code: string,
        items: FakeListFieldItem[],
    ): FakeListField => ({
        code: `sales_${type}_${code}`,
        bitrixCamelId: listFieldKey(type, code),
        items,
    });
    return {
        group: 'sales',
        type,
        bitrixId: type === 'kpi' ? KPI_IBLOCK_ID : HISTORY_IBLOCK_ID,
        bitrixfields: [
            ...KPI_SCALAR_FIELDS.map(code => ({
                code: `sales_${type}_${code}`,
                bitrixCamelId: listFieldKey(type, code),
            })),
            // bitrixId вариантов не зависит от того, каких вариантов на
            // портале нет: у оставшихся он тот же.
            enumeration(
                'event_type',
                makeListItems(KPI_EVENT_TYPE_ITEMS).filter(
                    item => !options.missingEventTypes?.includes(item.code),
                ),
            ),
            enumeration('event_action', makeListItems(KPI_EVENT_ACTION_ITEMS)),
            enumeration('op_work_status', makeListItems(['op_status_in_work'])),
            enumeration(
                'op_result_status',
                makeListItems(['op_call_result_yes']),
            ),
            enumeration(
                'op_prospects_type',
                makeListItems(['op_prospects_good']),
            ),
        ],
    };
};

/** Списки «ОП KPI» и «ОП История» с вариантами событий документов. */
export const makeSalesLists = (
    options: SalesListsOptions = {},
): Record<string, FakeList> => ({
    sales_kpi: makeKpiList('kpi', options),
    sales_history: makeKpiList('history', options),
});

/** Свойства старого списка «Презентации» на фейковом портале. */
export const PRESENTATION_LIST_KEYS = {
    sumOffer: 'PROPERTY_301',
    sumInvoice: 'PROPERTY_302',
    doneComment: 'PROPERTY_303',
    prospectsType: 'PROPERTY_304',
} as const;
/** bitrixId варианта `pres_prospects_good` поля «Перспективность». */
export const PRESENTATION_PROSPECTS_GOOD_ID = 41;
/** Другой вариант того же поля: им строка стоит до документа. */
export const PRESENTATION_PROSPECTS_OTHER_ID = 42;

/** Список «Презентации»; `missing` — коды полей, которых на портале нет. */
export const makePresentationList = (
    missing: readonly string[] = [],
): FakeList => {
    const codes = PBX_SALES_PRESENTATION_LIST_FIELD_CODES;
    const fullCode = (fieldCode: string): string =>
        `sales_presentation_${fieldCode}`;
    const field = (
        fieldCode: string,
        bitrixCamelId: string,
        items?: FakeListFieldItem[],
    ): FakeListField => ({
        code: fullCode(fieldCode),
        bitrixCamelId,
        items,
    });
    return {
        group: 'sales',
        type: 'presentation',
        bitrixId: PRESENTATION_IBLOCK_ID,
        bitrixfields: [
            field(codes.sumOffer, PRESENTATION_LIST_KEYS.sumOffer),
            field(codes.sumInvoice, PRESENTATION_LIST_KEYS.sumInvoice),
            field(codes.doneComment, PRESENTATION_LIST_KEYS.doneComment),
            field(codes.prospectsType, PRESENTATION_LIST_KEYS.prospectsType, [
                {
                    code: PBX_SALES_PRESENTATION_LIST_ITEM_CODES.prospectsGood,
                    bitrixId: PRESENTATION_PROSPECTS_GOOD_ID,
                },
                {
                    code: 'pres_prospects_other',
                    bitrixId: PRESENTATION_PROSPECTS_OTHER_ID,
                },
            ]),
        ].filter(
            item =>
                !missing.some(fieldCode => item.code === fullCode(fieldCode)),
        ),
    };
};
