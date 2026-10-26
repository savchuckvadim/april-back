/**
 * Портал-фикстура списка sales_kpi для тестов дайджеста: item'ы с
 * префиксом списка (как в проде), поля — bitrixCamelId PROPERTY_N.
 */
export const DIGEST_LIST_FIXTURE = {
    group: 'sales',
    type: 'kpi',
    bitrixId: '55',
    bitrixfields: [
        {
            code: 'sales_kpi_event_type',
            name: 'Тип события',
            bitrixId: '101',
            bitrixCamelId: 'PROPERTY_101',
            items: [
                { code: 'sales_kpi_xo', name: 'Холодный звонок', bitrixId: 21 },
                { code: 'sales_kpi_call', name: 'Звонок', bitrixId: 22 },
                {
                    code: 'sales_kpi_presentation',
                    name: 'Презентация',
                    bitrixId: 23,
                },
                {
                    code: 'sales_kpi_presentation_uniq',
                    name: 'През. уникальная',
                    bitrixId: 24,
                },
                { code: 'sales_kpi_ev_offer', name: 'КП', bitrixId: 25 },
                { code: 'sales_kpi_ev_success', name: 'Продажа', bitrixId: 26 },
                { code: 'sales_kpi_ev_fail', name: 'Отказ', bitrixId: 27 },
            ],
        },
        {
            code: 'sales_kpi_event_action',
            name: 'Действие',
            bitrixId: '100',
            bitrixCamelId: 'PROPERTY_100',
            items: [
                { code: 'sales_kpi_plan', name: 'Запланирован', bitrixId: 11 },
                { code: 'sales_kpi_pound', name: 'Перенос', bitrixId: 12 },
                { code: 'sales_kpi_done', name: 'Состоялся', bitrixId: 13 },
                {
                    code: 'sales_kpi_act_noresult_fail',
                    name: 'Не состоялся',
                    bitrixId: 14,
                },
                { code: 'sales_kpi_expired', name: 'Просрочен', bitrixId: 15 },
                { code: 'sales_kpi_act_send', name: 'Отправлен', bitrixId: 16 },
            ],
        },
        {
            code: 'sales_kpi_event_date',
            name: 'Дата события',
            bitrixId: '103',
            bitrixCamelId: 'PROPERTY_103',
            items: [],
        },
        {
            code: 'sales_kpi_plan_date',
            name: 'Дата плана',
            bitrixId: '104',
            bitrixCamelId: 'PROPERTY_104',
            items: [],
        },
        {
            code: 'sales_kpi_responsible',
            name: 'Ответственный',
            bitrixId: '102',
            bitrixCamelId: 'PROPERTY_102',
            items: [],
        },
        {
            code: 'sales_kpi_manager_comment',
            name: 'Комментарий',
            bitrixId: '105',
            bitrixCamelId: 'PROPERTY_105',
            items: [],
        },
        {
            code: 'sales_kpi_op_result_status',
            name: 'Результат',
            bitrixId: '106',
            bitrixCamelId: 'PROPERTY_106',
            items: [
                {
                    code: 'sales_kpi_op_call_result_yes',
                    name: 'Результативно',
                    bitrixId: 31,
                },
                {
                    code: 'sales_kpi_op_call_result_no',
                    name: 'Нерезультативно',
                    bitrixId: 32,
                },
            ],
        },
        {
            code: 'sales_kpi_op_noresult_reason',
            name: 'Причина',
            bitrixId: '107',
            bitrixCamelId: 'PROPERTY_107',
            items: [
                {
                    code: 'sales_kpi_nopickup',
                    name: 'Не берут трубку',
                    bitrixId: 41,
                },
                { code: 'sales_kpi_secretar', name: 'Секретарь', bitrixId: 42 },
            ],
        },
        {
            code: 'sales_kpi_crm',
            name: 'CRM',
            bitrixId: '108',
            bitrixCamelId: 'PROPERTY_108',
            items: [],
        },
        {
            code: 'sales_kpi_crm_company',
            name: 'Компания',
            bitrixId: '109',
            bitrixCamelId: 'PROPERTY_109',
            items: [],
        },
    ],
};

export const portalModelMock = (
    deals: {
        categories?: Record<string, unknown>;
        fields?: Record<string, string>;
    } = {},
) => ({
    getListByCode: (code: string) =>
        code === 'sales_kpi' ? DIGEST_LIST_FIXTURE : undefined,
    getDealCategoryByCode: (code: string) => deals.categories?.[code],
    getDealFieldBitrixIdByCode: (code: string) => deals.fields?.[code] ?? '',
});

/** Элемент списка как отдаёт lists.element.get ({valueId: value}-объекты). */
export const listElement = (input: {
    id: number;
    userId: number;
    type: number;
    action: number;
    eventDate: string;
    planDate?: string;
    result?: number;
    reason?: number;
    comment?: string;
    crm?: string[];
    company?: string;
}): Record<string, unknown> => ({
    ID: String(input.id),
    NAME: `Событие ${input.id}`,
    DATE_CREATE: input.eventDate,
    PROPERTY_101: { [`${1000 + input.id}`]: String(input.type) },
    PROPERTY_100: { [`${2000 + input.id}`]: String(input.action) },
    PROPERTY_103: { [`${3000 + input.id}`]: input.eventDate },
    ...(input.planDate
        ? { PROPERTY_104: { [`${4000 + input.id}`]: input.planDate } }
        : {}),
    PROPERTY_102: { [`${5000 + input.id}`]: String(input.userId) },
    ...(input.comment
        ? { PROPERTY_105: { [`${6000 + input.id}`]: input.comment } }
        : {}),
    ...(input.result
        ? { PROPERTY_106: { [`${7000 + input.id}`]: String(input.result) } }
        : {}),
    ...(input.reason
        ? { PROPERTY_107: { [`${8000 + input.id}`]: String(input.reason) } }
        : {}),
    ...(input.crm
        ? {
              PROPERTY_108: Object.fromEntries(
                  input.crm.map((ref, i) => [
                      `${9000 + input.id * 10 + i}`,
                      ref,
                  ]),
              ),
          }
        : {}),
    ...(input.company
        ? { PROPERTY_109: { [`${9900 + input.id}`]: input.company } }
        : {}),
});
