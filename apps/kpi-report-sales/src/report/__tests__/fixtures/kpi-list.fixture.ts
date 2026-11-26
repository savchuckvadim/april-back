import type {
    IField,
    IFieldItem,
} from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Значение списочного поля списка KPI (служебные поля — заглушки). */
export function fieldItem(
    code: string,
    name: string,
    bitrixId: number,
): IFieldItem {
    return {
        id: bitrixId,
        created_at: new Date(0),
        updated_at: new Date(0),
        bitrixfield_id: 0,
        name,
        title: name,
        code,
        bitrixId,
    };
}

/** Поле списка KPI с кодом и PROPERTY-идентификатором. */
export function listField(
    code: string,
    bitrixCamelId: string,
    items: IFieldItem[] = [],
): IField {
    return {
        type: 'list',
        code,
        name: code,
        title: code,
        bitrixId: bitrixCamelId,
        bitrixCamelId,
        items,
    };
}

/**
 * Список KPI портала «как в жизни»: холодный звонок (xo) и звонок дают
 * действие «Звонок» дважды (в отчёт идёт только call_plan/call_done),
 * презентации с лишними пробелами в названии («План  Презентация»), КП,
 * продажа и отказ; часть сочетаний (xo × act_send, ev_offer × plan,
 * expired) ActionService не распознаёт.
 */
export const KPI_LIST_FIELDS: IField[] = [
    listField('sales_kpi_event_action', 'PROPERTY_100', [
        fieldItem('plan', 'План', 11),
        fieldItem('done', 'Факт', 12),
        fieldItem('act_send', 'Отправлено', 13),
        fieldItem('expired', 'Просрочено', 14),
    ]),
    listField('sales_kpi_event_type', 'PROPERTY_101', [
        fieldItem('xo', 'Холодный звонок', 21),
        fieldItem('call', 'Звонок', 22),
        fieldItem('presentation', 'Презентация', 23),
        fieldItem('presentation_uniq', 'Презентация уникальная', 24),
        fieldItem('ev_offer', 'КП', 25),
        fieldItem('ev_success', 'Продажа', 26),
        fieldItem('ev_fail', 'Отказ', 27),
    ]),
    listField('sales_kpi_responsible', 'PROPERTY_102'),
    listField('sales_kpi_event_date', 'PROPERTY_103'),
];

/** Колонки строки отчёта по KPI_LIST_FIELDS: innerCode → название в отчёте. */
export const KPI_LIST_REPORT_COLUMNS: { innerCode: string; name: string }[] = [
    { innerCode: 'result_communication_plan', name: 'План' },
    { innerCode: 'result_communication_done', name: 'Результативные' },
    { innerCode: 'call_plan', name: 'План Звонок' },
    { innerCode: 'call_done', name: 'Звонок' },
    { innerCode: 'presentation_plan', name: 'План  Презентация' },
    { innerCode: 'presentation_done', name: ' Презентация' },
    { innerCode: 'presentation_uniq_plan', name: 'План  През. уникальная' },
    { innerCode: 'presentation_uniq_done', name: ' През. уникальная' },
    { innerCode: 'ev_offer_act_send', name: 'КП' },
    { innerCode: 'ev_success_done', name: 'Продажа' },
    { innerCode: 'ev_fail_done', name: 'Отказ' },
];
