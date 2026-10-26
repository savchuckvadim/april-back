/** Слепок портала с воронками и полями сделок для тестов презентаций дня. */
export const DEAL_PORTAL = {
    categories: {
        sales_presentation: {
            bitrixId: '12',
            stages: [
                {
                    code: 'spres_plan',
                    bitrixId: 'C12:PLAN',
                    name: 'Запланирована',
                },
                {
                    code: 'spres_pending',
                    bitrixId: 'C12:PENDING',
                    name: 'Перенос',
                },
                {
                    code: 'spres_success',
                    bitrixId: 'C12:WON',
                    name: 'Презентация проведена',
                },
                {
                    code: 'spres_noresult',
                    bitrixId: 'C12:APOLOGY',
                    name: 'Не состоялась',
                },
                {
                    code: 'spres_fail',
                    bitrixId: 'C12:LOSE',
                    name: 'Отказ после презентации',
                },
            ],
        },
        sales_base: { bitrixId: '0', stages: [] },
    },
    fields: {
        to_base_sales: 'UF_CRM_TO_BASE_SALES',
        next_pres_plan_date: 'UF_CRM_NEXT_PRES_PLAN_DATE',
        last_pres_plan_date: 'UF_CRM_LAST_PRES_PLAN_DATE',
        last_pres_done_date: 'UF_CRM_LAST_PRES_DONE_DATE',
        op_mhistory: 'UF_CRM_OP_MHISTORY',
        complect_name: 'UF_CRM_1684145200',
        xo_created: 'UF_CRM_XO_CREATED',
    },
};
