import {
    BitrixFieldWithItems,
    CategoryWithStages,
    PolymorphicIndex,
    PortalAggregate,
    PortalWithRelations,
} from '../repositories/portal-aggregate.types';

/** Строка bitrixfield_items для тестов. */
export const fieldItemRow = (
    over: Partial<BitrixFieldWithItems['bitrixfield_items'][number]> = {},
): BitrixFieldWithItems['bitrixfield_items'][number] =>
    ({
        id: 10n,
        created_at: new Date('2024-01-01T00:00:00.000Z'),
        updated_at: new Date('2024-01-02T00:00:00.000Z'),
        bitrixfield_id: 5n,
        name: 'nok',
        title: 'НОК',
        code: 'nok',
        bitrixId: 128,
        ...over,
    }) as BitrixFieldWithItems['bitrixfield_items'][number];

/** Строка bitrixfields (+items) для тестов. */
export const fieldRow = (
    over: Partial<BitrixFieldWithItems> = {},
): BitrixFieldWithItems =>
    ({
        id: 5n,
        entity_type: 'App\\Models\\BtxDeal',
        entity_id: 3n,
        parent_type: 'deal',
        created_at: null,
        updated_at: null,
        type: 'enumeration',
        title: 'Тип события',
        name: 'event_type',
        bitrixId: 'UF_CRM_1',
        bitrixCamelId: 'ufCrm1',
        code: 'event_type',
        bitrixfield_items: [fieldItemRow()],
        ...over,
    }) as BitrixFieldWithItems;

/** Строка btx_stages для тестов. */
export const stageRow = (
    over: Partial<CategoryWithStages['btx_stages'][number]> = {},
): CategoryWithStages['btx_stages'][number] =>
    ({
        id: 7n,
        created_at: new Date('2024-01-01T00:00:00.000Z'),
        updated_at: null,
        btx_category_id: 2n,
        name: 'cold_new',
        title: 'Новая',
        code: 'cold_new',
        bitrixId: 'NEW',
        color: '#39A8EF',
        isActive: true,
        ...over,
    }) as CategoryWithStages['btx_stages'][number];

/** Строка btx_categories (+stages) для тестов. */
export const categoryRow = (
    over: Partial<CategoryWithStages> = {},
): CategoryWithStages =>
    ({
        id: 2n,
        entity_type: 'App\\Models\\BtxDeal',
        entity_id: 3n,
        parent_type: 'deal',
        created_at: null,
        updated_at: null,
        type: 'base',
        group: 'sales',
        title: 'Продажи',
        name: 'sales_base',
        bitrixId: '34',
        bitrixCamelId: '34',
        code: 'sales_base',
        isActive: true,
        btx_stages: [stageRow()],
        ...over,
    }) as CategoryWithStages;

/** Портал со всеми relations для тестов (по умолчанию пустые коллекции). */
export const portalRow = (
    over: Partial<PortalWithRelations> = {},
): PortalWithRelations =>
    ({
        id: 1n,
        created_at: null,
        updated_at: null,
        domain: 'test.bitrix24.ru',
        key: 'laravel-encrypted-key',
        C_REST_CLIENT_ID: 'enc-client-id',
        C_REST_CLIENT_SECRET: 'enc-secret',
        C_REST_WEB_HOOK_URL: 'enc-hook',
        number: 1,
        client_id: null,
        nestKey: null,
        member_id: null,
        source: 'legacy',
        approval_status: null,
        approved_at: null,
        approved_by: null,
        bitrixlists: [],
        smarts: [],
        btx_deals: [],
        btx_companies: [],
        btx_contacts: [],
        btx_leads: [],
        btx_rpas: [],
        btx_users: [],
        departaments: [],
        callings: [],
        bxRqs: [],
        portal_measure: [],
        ...over,
    }) as PortalWithRelations;

const buildIndex = <T extends { entity_type: string; entity_id: bigint }>(
    rows: T[],
): PolymorphicIndex<T> => {
    const index: PolymorphicIndex<T> = new Map();
    for (const row of rows) {
        const byId = index.get(row.entity_type) ?? new Map<number, T[]>();
        index.set(row.entity_type, byId);
        const id = Number(row.entity_id);
        byId.set(id, [...(byId.get(id) ?? []), row]);
    }
    return index;
};

/** Готовый агрегат портала для тестов сервисов и мапперов. */
export const aggregateFixture = (
    portal: PortalWithRelations,
    fields: BitrixFieldWithItems[] = [],
    categories: CategoryWithStages[] = [],
): PortalAggregate => ({
    portal,
    fieldsIndex: buildIndex(fields),
    categoriesIndex: buildIndex(categories),
});

/** Строка smarts для тестов. */
export const smartRow = (
    over: Partial<PortalWithRelations['smarts'][number]> = {},
): PortalWithRelations['smarts'][number] =>
    ({
        id: 4n,
        type: 'sales',
        group: 'sales',
        name: 'xo',
        title: 'ХО',
        bitrixId: 134n,
        entityTypeId: 134n,
        forStageId: null,
        forFilterId: null,
        crmId: null,
        portal_id: 1n,
        created_at: null,
        updated_at: null,
        forStage: 'DT134_14',
        forFilter: null,
        crm: 'T9c',
        ...over,
    }) as PortalWithRelations['smarts'][number];

/** Строка btx_deals для тестов. */
export const dealRow = (
    over: Partial<PortalWithRelations['btx_deals'][number]> = {},
): PortalWithRelations['btx_deals'][number] =>
    ({
        id: 3n,
        created_at: null,
        updated_at: null,
        name: 'deal',
        title: 'Сделка',
        code: 'deal',
        portal_id: 1n,
        ...over,
    }) as PortalWithRelations['btx_deals'][number];

/** Строка bitrixlists для тестов. */
export const listRow = (
    over: Partial<PortalWithRelations['bitrixlists'][number]> = {},
): PortalWithRelations['bitrixlists'][number] =>
    ({
        id: 6n,
        type: 'kpi',
        group: 'sales',
        name: 'sales_kpi',
        title: 'KPI Продажи',
        bitrixId: 41n,
        portal_id: 1n,
        ...over,
    }) as PortalWithRelations['bitrixlists'][number];

/** Строка departaments для тестов. */
export const departamentRow = (
    over: Partial<PortalWithRelations['departaments'][number]> = {},
): PortalWithRelations['departaments'][number] =>
    ({
        id: 2n,
        type: 'sales',
        group: 'sales',
        name: 'sales_department',
        title: 'Отдел продаж',
        is_multiple: false,
        multiple_tag: null,
        bitrixId: 15n,
        portal_id: 1n,
        ...over,
    }) as PortalWithRelations['departaments'][number];

/** Строка callings для тестов. */
export const callingRow = (
    over: Partial<PortalWithRelations['callings'][number]> = {},
): PortalWithRelations['callings'][number] =>
    ({
        id: 3n,
        type: 'calling',
        group: 'sales',
        name: 'sales_calling',
        title: 'Звонки Продажи',
        bitrixId: 21n,
        portal_id: 1n,
        ...over,
    }) as PortalWithRelations['callings'][number];
