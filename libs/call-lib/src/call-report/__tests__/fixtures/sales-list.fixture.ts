/**
 * Общая фикстура списков отчётности ОП для спеков разбора звонков:
 * слепок списков «ОП KPI» / «ОП История» по канону kpi-report (поля —
 * PROPERTY_N, значения выпадающих списков — bitrixId элементов) и элемент
 * списка с crm-ссылками семьи.
 *
 * Одна фикстура на спеки источника истины (`call-report-list-truth`) и
 * раскладки сделок (`call-report-deal-family`) — чтобы «как выглядит
 * элемент списка» было описано в одном месте.
 */

/** Воронки портала: основная 0, презентации 12, ХО 14 (чужая — 28). */
export const SALES_CATEGORIES: Record<
    string,
    { bitrixId: number } | undefined
> = {
    sales_base: { bitrixId: 0 },
    sales_presentation: { bitrixId: 12 },
    sales_xo: { bitrixId: 14 },
};

/** IBLOCK_ID списков в фикстуре. */
export const SALES_LIST_IBLOCK = { kpi: '10', history: '20' } as const;

export type SalesListType = 'kpi' | 'history';

/** Слепок списка отчётности с полями «дата/тип/ответственный/crm». */
export const makeSalesList = (type: SalesListType) => ({
    group: 'sales',
    type,
    bitrixId: SALES_LIST_IBLOCK[type],
    bitrixfields: [
        {
            code: `sales_${type}_event_date`,
            name: 'Дата события',
            bitrixId: 'PROPERTY_1',
            bitrixCamelId: 'PROPERTY_1',
            items: [],
        },
        {
            code: `sales_${type}_event_type`,
            name: 'Тип события',
            bitrixId: 'PROPERTY_2',
            bitrixCamelId: 'PROPERTY_2',
            items: [
                { code: `sales_${type}_call`, name: 'Звонок', bitrixId: 201 },
                {
                    code: `sales_${type}_presentation`,
                    name: 'Презентация',
                    bitrixId: 202,
                },
            ],
        },
        {
            code: `sales_${type}_responsible`,
            name: 'Ответственный',
            bitrixId: 'PROPERTY_4',
            bitrixCamelId: 'PROPERTY_4',
            items: [],
        },
        {
            code: `sales_${type}_crm`,
            name: 'CRM',
            bitrixId: 'PROPERTY_5',
            bitrixCamelId: 'PROPERTY_5',
            items: [],
        },
    ],
});

/** Элемент списка: crm-ссылки семьи, тип события и ответственный. */
export const salesListItem = (options: {
    id: number;
    crm: string[];
    eventDate?: string;
    typeId?: number;
    responsible?: number;
}) => ({
    ID: options.id,
    NAME: 'Звонок клиенту',
    DATE_CREATE: '2026-09-14T08:30:00Z',
    PROPERTY_1: { 11: options.eventDate ?? '14.09.2026' },
    PROPERTY_2: { 12: options.typeId ?? 201 },
    PROPERTY_4: { 14: options.responsible ?? 622 },
    PROPERTY_5: Object.fromEntries(
        options.crm.map((ref, index) => [String(100 + index), ref]),
    ),
});

/** Резолв поля списка по короткому коду — семантика PortalModel. */
export const salesListFieldByCode = (
    list: { group: string; type: string },
    code: string,
): unknown =>
    makeSalesList(list.type as SalesListType).bitrixfields.find(
        field => field.code === `${list.group}_${list.type}_${code}`,
    );
