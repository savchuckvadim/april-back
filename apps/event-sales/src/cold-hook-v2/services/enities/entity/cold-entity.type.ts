export enum ColdEntityCodesEnum {
    xo_name = 'xo_name',
    call_next_name = 'call_next_name',
    xo_date = 'xo_date',
    call_next_date = 'call_next_date',
    /**
     * Дата назначенной презентации: холодный старт закрывает элементы
     * презентаций, и дата у владельца/основной обязана обнулиться — иначе
     * карточка сообщала бы о презентации, которой нет (ревью 02.09).
     */
    next_pres_plan_date = 'next_pres_plan_date',
    call_last_date = 'call_last_date',
    xo_responsible = 'xo_responsible',
    manager_op = 'manager_op',
    xo_created = 'xo_created',
    op_history = 'op_history',
    op_mhistory = 'op_mhistory',
    op_current_status = 'op_current_status',
    op_work_status = 'op_work_status',
    op_prospects_type = 'op_prospects_type',
}

// 'xo_name',
// 'xo_date',
// 'xo_responsible',
// 'xo_created',
// 'manager_op',
// 'call_next_date',
// 'call_next_name',
// 'call_last_date',
// 'op_history',
// 'op_history_multiple',
