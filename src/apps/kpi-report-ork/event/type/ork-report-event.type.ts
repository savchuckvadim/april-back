




export type FilterCode =
    | 'et_ork_signal_ea_ork_plan' //Сервисный сигнал
    | 'et_ork_signal_ea_ork_expired' // Сервисный сигнал
    | 'et_ork_signal_ea_ork_done' // Сервисный сигнал
    | 'et_ork_signal_ea_ork_pound' // Сервисный сигнал
    | 'et_ork_signal_ea_ork_act_noresult_fail' // Сервисный сигнал

    | 'et_ork_info_ea_ork_plan' // Информация
    | 'et_ork_info_ea_ork_expired' // Информация
    | 'et_ork_info_ea_ork_done' // Информация
    | 'et_ork_info_ea_ork_pound' // Информация
    | 'et_ork_info_ea_ork_act_noresult_fail' // Информация


    | 'et_ork_call_doc_ea_ork_plan' // Звонок по документам
    | 'et_ork_call_doc_ea_ork_expired' // Звонок по документам
    | 'et_ork_call_doc_ea_ork_done' // Звонок по документам
    | 'et_ork_call_doc_ea_ork_pound' // Звонок по документам
    | 'et_ork_call_doc_ea_ork_act_noresult_fail' // Звонок по документам

    | 'et_ork_call_money_ea_ork_plan' // Звонок по оплате
    | 'et_ork_call_money_ea_ork_expired' // Звонок по оплате
    | 'et_ork_call_money_ea_ork_done' // Звонок по оплате
    | 'et_ork_call_money_ea_ork_pound' // Звонок по оплате
    | 'et_ork_call_money_ea_ork_act_noresult_fail' // Звонок по оплате

    | 'et_ork_call_collect_ea_ork_plan' // Звонок по задолженности
    | 'et_ork_call_collect_ea_ork_expired' // Звонок по задолженности
    | 'et_ork_call_collect_ea_ork_done' // Звонок по задолженности
    | 'et_ork_call_collect_ea_ork_pound' // Звонок по задолженности
    | 'et_ork_call_collect_ea_ork_act_noresult_fail' // Звонок по задолженности

    | 'et_ork_info_garant_ea_ork_plan' // Инфоповод Гарант
    | 'et_ork_info_garant_ea_ork_expired' // Инфоповод Гарант
    | 'et_ork_info_garant_ea_ork_done' // Инфоповод Гарант
    | 'et_ork_info_garant_ea_ork_pound' // Инфоповод Гарант
    | 'et_ork_info_garant_ea_ork_act_noresult_fail' // Инфоповод Гарант

    | 'et_ork_presentation_ea_ork_plan' // Презентация
    | 'et_ork_presentation_ea_ork_expired' // Презентация
    | 'et_ork_presentation_ea_ork_done' // Презентация
    | 'et_ork_presentation_ea_ork_pound' // Презентация
    | 'et_ork_presentation_ea_ork_act_noresult_fail' // Презентация

    | 'et_ork_presentation_uniq_ea_ork_plan' // Презентация(уникальная)
    | 'et_ork_presentation_uniq_ea_ork_expired' // Презентация(уникальная)
    | 'et_ork_presentation_uniq_ea_ork_done' // Презентация(уникальная)
    | 'et_ork_presentation_uniq_ea_ork_pound' // Презентация(уникальная)
    | 'et_ork_presentation_uniq_ea_ork_act_noresult_fail' // Презентация(уникальная)

    | 'et_ork_edu_first_ea_ork_plan' // Обучение первичное
    | 'et_ork_edu_first_ea_ork_expired' // Обучение первичное
    | 'et_ork_edu_first_ea_ork_done' // Обучение первичное
    | 'et_ork_edu_first_ea_ork_pound' // Обучение первичное
    | 'et_ork_edu_first_ea_ork_act_noresult_fail' // Обучение первичное

    | 'et_ork_edu_ea_ork_plan' // Обучение
    | 'et_ork_edu_ea_ork_expired' // Обучение
    | 'et_ork_edu_ea_ork_done' // Обучение
    | 'et_ork_edu_ea_ork_pound' // Обучение
    | 'et_ork_edu_ea_ork_act_noresult_fail' // Обучение

    | 'et_ork_complect_up_work_ea_ork_plan' // Работа по увеличению комплекта
    | 'et_ork_complect_up_work_ea_ork_expired' // Работа по увеличению комплекта
    | 'et_ork_complect_up_work_ea_ork_done' // Работа по увеличению комплекта
    | 'et_ork_complect_up_work_ea_ork_pound' // Работа по увеличению комплекта
    | 'et_ork_complect_up_work_ea_ork_act_noresult_fail' // Работа по увеличению комплекта


    | 'et_ork_pere_contract_ea_ork_plan' // Перезаключение
    | 'et_ork_pere_contract_ea_ork_expired' // Перезаключение
    | 'et_ork_pere_contract_ea_ork_done' // Перезаключение
    | 'et_ork_pere_contract_ea_ork_pound' // Перезаключение
    | 'et_ork_pere_contract_ea_ork_act_noresult_fail' // Перезаключение

    | 'et_ork_complect_up_ea_ork_plan' // Увеличение комплекта
    | 'et_ork_complect_up_ea_ork_expired' // Увеличение комплекта
    | 'et_ork_complect_up_ea_ork_done' // Увеличение комплекта
    | 'et_ork_complect_up_ea_ork_pound' // Увеличение комплекта
    | 'et_ork_complect_up_ea_ork_act_noresult_fail' // Увеличение комплекта


    | 'et_ork_complect_down_ea_ork_plan' // Уменьшение комплекта
    | 'et_ork_complect_down_ea_ork_expired' // Уменьшение комплекта
    | 'et_ork_complect_down_ea_ork_done' // Уменьшение комплекта
    | 'et_ork_complect_down_ea_ork_pound' // Уменьшение комплекта
    | 'et_ork_complect_down_ea_ork_act_noresult_fail' // Уменьшение комплекта


    | 'et_ork_fail_prevention_ea_ork_plan' // Профилактика отказа
    | 'et_ork_fail_prevention_ea_ork_expired' // Профилактика отказа
    | 'et_ork_fail_prevention_ea_ork_done' // Профилактика отказа
    | 'et_ork_fail_prevention_ea_ork_pound' // Профилактика отказа
    | 'et_ork_fail_prevention_ea_ork_act_noresult_fail' // Профилактика отказа

    | 'et_ork_fail_work_ea_ork_plan' // Работа по устранению угрозы отказа
    | 'et_ork_fail_work_ea_ork_expired' // Работа по устранению угрозы отказа
    | 'et_ork_fail_work_ea_ork_done' // Работа по устранению угрозы отказа
    | 'et_ork_fail_work_ea_ork_pound' // Работа по устранению угрозы отказа
    | 'et_ork_fail_work_ea_ork_act_noresult_fail' // Работа по устранению угрозы отказа

    | 'et_ork_threat_ea_ork_plan' // Возникновение угрозы отказа
    | 'et_ork_threat_ea_ork_expired' // Возникновение угрозы отказа
    | 'et_ork_threat_ea_ork_done' // Возникновение угрозы отказа
    | 'et_ork_threat_ea_ork_pound' // Возникновение угрозы отказа
    | 'et_ork_threat_ea_ork_act_noresult_fail' // Возникновение угрозы отказа

    | 'et_ork_fail_work_success_ea_ork_plan' // Устранение угрозы отказа
    | 'et_ork_fail_work_success_ea_ork_expired' // Устранение угрозы отказа
    | 'et_ork_fail_work_success_ea_ork_done' // Устранение угрозы отказа
    | 'et_ork_fail_work_success_ea_ork_pound' // Устранение угрозы отказа
    | 'et_ork_fail_work_success_ea_ork_act_noresult_fail' // Устранение угрозы отказа

export type FilterInnerCode = EnumFilterInnerCode
    // | FilterCode

    // | 'et_ork_call_ea_ork_plan' // Звонок по оплате
    // | 'et_ork_call_ea_ork_expired' // Звонок по оплате
    // | 'et_ork_call_ea_ork_done' // Звонок по оплате
    // | 'et_ork_call_ea_ork_pound' // Звонок по оплате
    // | 'et_ork_call_ea_ork_act_noresult_fail' // Звонок по оплате;


export enum EnumFilterInnerCode {
    signal_plan = 'et_ork_signal_ea_ork_plan', //Сервисный сигнал
    signal_expired = 'et_ork_signal_ea_ork_expired', // Сервисный сигнал
    signal_done = 'et_ork_signal_ea_ork_done', // Сервисный сигнал
    signal_pound = 'et_ork_signal_ea_ork_pound', // Сервисный сигнал
    signal_act_noresult_fail = 'et_ork_signal_ea_ork_act_noresult_fail', // Сервисный сигнал

    info_plan = 'et_ork_info_ea_ork_plan', // Информация
    info_expired = 'et_ork_info_ea_ork_expired', // Информация
    info_done = 'et_ork_info_ea_ork_done', // Информация
    info_pound = 'et_ork_info_ea_ork_pound', // Информация
    info_act_noresult_fail = 'et_ork_info_ea_ork_act_noresult_fail', // Информация


    call_doc_plan = 'et_ork_call_doc_ea_ork_plan', // Звонок по документам
    call_doc_expired = 'et_ork_call_doc_ea_ork_expired', // Звонок по документам
    call_doc_done = 'et_ork_call_doc_ea_ork_done', // Звонок по документам
    call_doc_pound = 'et_ork_call_doc_ea_ork_pound', // Звонок по документам
    call_doc_act_noresult_fail = 'et_ork_call_doc_ea_ork_act_noresult_fail', // Звонок по документам

    call_money_plan = 'et_ork_call_money_ea_ork_plan', // Звонок по оплате
    call_money_expired = 'et_ork_call_money_ea_ork_expired', // Звонок по оплате
    call_money_done = 'et_ork_call_money_ea_ork_done', // Звонок по оплате
    call_money_pound = 'et_ork_call_money_ea_ork_pound', // Звонок по оплате
    call_money_act_noresult_fail = 'et_ork_call_money_ea_ork_act_noresult_fail', // Звонок по оплате

    call_collect_plan = 'et_ork_call_collect_ea_ork_plan', // Звонок по задолженности
    call_collect_expired = 'et_ork_call_collect_ea_ork_expired', // Звонок по задолженности
    call_collect_done = 'et_ork_call_collect_ea_ork_done', // Звонок по задолженности
    call_collect_pound = 'et_ork_call_collect_ea_ork_pound', // Звонок по задолженности
    call_collect_act_noresult_fail = 'et_ork_call_collect_ea_ork_act_noresult_fail', // Звонок по задолженности

    info_garant_plan = 'et_ork_info_garant_ea_ork_plan', // Инфоповод Гарант
    info_garant_expired = 'et_ork_info_garant_ea_ork_expired', // Инфоповод Гарант
    info_garant_done = 'et_ork_info_garant_ea_ork_done', // Инфоповод Гарант
    info_garant_pound = 'et_ork_info_garant_ea_ork_pound', // Инфоповод Гарант
    info_garant_act_noresult_fail = 'et_ork_info_garant_ea_ork_act_noresult_fail', // Инфоповод Гарант

    presentation_plan = 'et_ork_presentation_ea_ork_plan', // Презентация
    presentation_expired = 'et_ork_presentation_ea_ork_expired', // Презентация
    presentation_done = 'et_ork_presentation_ea_ork_done', // Презентация
    presentation_pound = 'et_ork_presentation_ea_ork_pound', // Презентация
    presentation_act_noresult_fail = 'et_ork_presentation_ea_ork_act_noresult_fail', // Презентация

    presentati_plan = 'et_ork_presentation_uniq_ea_ork_plan', // Презентация(уникальная)
    presentati_expired = 'et_ork_presentation_uniq_ea_ork_expired', // Презентация(уникальная)
    presentati_done = 'et_ork_presentation_uniq_ea_ork_done', // Презентация(уникальная)
    presentati_pound = 'et_ork_presentation_uniq_ea_ork_pound', // Презентация(уникальная)
    presentati_act_noresult_fail = 'et_ork_presentation_uniq_ea_ork_act_noresult_fail', // Презентация(уникальная)

    edu_first_plan = 'et_ork_edu_first_ea_ork_plan', // Обучение первичное
    edu_first_expired = 'et_ork_edu_first_ea_ork_expired', // Обучение первичное
    edu_first_done = 'et_ork_edu_first_ea_ork_done', // Обучение первичное
    edu_first_pound = 'et_ork_edu_first_ea_ork_pound', // Обучение первичное
    edu_first_act_noresult_fail = 'et_ork_edu_first_ea_ork_act_noresult_fail', // Обучение первичное

    edu_plan = 'et_ork_edu_ea_ork_plan', // Обучение
    edu_expired = 'et_ork_edu_ea_ork_expired', // Обучение
    edu_done = 'et_ork_edu_ea_ork_done', // Обучение
    edu_pound = 'et_ork_edu_ea_ork_pound', // Обучение
    edu_act_noresult_fail = 'et_ork_edu_ea_ork_act_noresult_fail', // Обучение

    complect_up_work_plan = 'et_ork_complect_up_work_ea_ork_plan', // Работа по увеличению комплекта
    complect_up_work_expired = 'et_ork_complect_up_work_ea_ork_expired', // Работа по увеличению комплекта
    complect_up_work_done = 'et_ork_complect_up_work_ea_ork_done', // Работа по увеличению комплекта
    complect_up_work_pound = 'et_ork_complect_up_work_ea_ork_pound', // Работа по увеличению комплекта
    complect_up_work_act_noresult_fail = 'et_ork_complect_up_work_ea_ork_act_noresult_fail', // Работа по увеличению комплекта


    pere_contract_plan = 'et_ork_pere_contract_ea_ork_plan', // Перезаключение
    pere_contract_expired = 'et_ork_pere_contract_ea_ork_expired', // Перезаключение
    pere_contract_done = 'et_ork_pere_contract_ea_ork_done', // Перезаключение
    pere_contract_pound = 'et_ork_pere_contract_ea_ork_pound', // Перезаключение
    pere_contract_act_noresult_fail = 'et_ork_pere_contract_ea_ork_act_noresult_fail', // Перезаключение

    complect_up_plan = 'et_ork_complect_up_ea_ork_plan', // Увеличение комплекта
    complect_up_expired = 'et_ork_complect_up_ea_ork_expired', // Увеличение комплекта
    complect_up_done = 'et_ork_complect_up_ea_ork_done', // Увеличение комплекта
    complect_up_pound = 'et_ork_complect_up_ea_ork_pound', // Увеличение комплекта
    complect_up_act_noresult_fail = 'et_ork_complect_up_ea_ork_act_noresult_fail', // Увеличение комплекта


    complect_down_plan = 'et_ork_complect_down_ea_ork_plan', // Уменьшение комплекта
    complect_down_expired = 'et_ork_complect_down_ea_ork_expired', // Уменьшение комплекта
    complect_down_done = 'et_ork_complect_down_ea_ork_done', // Уменьшение комплекта
    complect_down_pound = 'et_ork_complect_down_ea_ork_pound', // Уменьшение комплекта
    complect_down_act_noresult_fail = 'et_ork_complect_down_ea_ork_act_noresult_fail', // Уменьшение комплекта


    fail_prevention_plan = 'et_ork_fail_prevention_ea_ork_plan', // Профилактика отказа
    fail_prevention_expired = 'et_ork_fail_prevention_ea_ork_expired', // Профилактика отказа
    fail_prevention_done = 'et_ork_fail_prevention_ea_ork_done', // Профилактика отказа
    fail_prevention_pound = 'et_ork_fail_prevention_ea_ork_pound', // Профилактика отказа
    fail_prevention_act_noresult_fail = 'et_ork_fail_prevention_ea_ork_act_noresult_fail', // Профилактика отказа

    fail_work_plan = 'et_ork_fail_work_ea_ork_plan', // Работа по устранению угрозы отказа
    fail_work_expired = 'et_ork_fail_work_ea_ork_expired', // Работа по устранению угрозы отказа
    fail_work_done = 'et_ork_fail_work_ea_ork_done', // Работа по устранению угрозы отказа
    fail_work_pound = 'et_ork_fail_work_ea_ork_pound', // Работа по устранению угрозы отказа
    fail_work_act_noresult_fail = 'et_ork_fail_work_ea_ork_act_noresult_fail', // Работа по устранению угрозы отказа

    threat_ea_plan = 'et_ork_threat_ea_ork_plan', // Возникновение угрозы отказа
    threat_ea_expired = 'et_ork_threat_ea_ork_expired', // Возникновение угрозы отказа
    threat_ea_done = 'et_ork_threat_ea_ork_done', // Возникновение угрозы отказа
    threat_ea_pound = 'et_ork_threat_ea_ork_pound', // Возникновение угрозы отказа
    threat_ea_act_noresult_fail = 'et_ork_threat_ea_ork_act_noresult_fail', // Возникновение угрозы отказа

    fail_work_success_plan = 'et_ork_fail_work_success_ea_ork_plan', // Устранение угрозы отказа
    fail_work_success_expired = 'et_ork_fail_work_success_ea_ork_expired', // Устранение угрозы отказа
    fail_work_success_done = 'et_ork_fail_work_success_ea_ork_done', // Устранение угрозы отказа
    fail_work_success_pound = 'et_ork_fail_work_success_ea_ork_pound', // Устранение угрозы отказа
    fail_work_success_act_noresult_fail = 'et_ork_fail_work_success_ea_ork_act_noresult_fail', // Устранение угрозы отказа

    call_plan = 'et_ork_call_ea_ork_plan',
    call_expired = 'et_ork_call_ea_ork_expired',
    call_done = 'et_ork_call_ea_ork_done',
    call_pound = 'et_ork_call_ea_ork_pound',
    call_act_noresult_fail = 'et_ork_call_ea_ork_act_noresult_fail',

}


export enum EnumFilterCode {
    signal_plan = 'et_ork_signal_ea_ork_plan', //Сервисный сигнал
    signal_expired = 'et_ork_signal_ea_ork_expired', // Сервисный сигнал
    signal_done = 'et_ork_signal_ea_ork_done', // Сервисный сигнал
    signal_pound = 'et_ork_signal_ea_ork_pound', // Сервисный сигнал
    signal_act_noresult_fail = 'et_ork_signal_ea_ork_act_noresult_fail', // Сервисный сигнал

    info_plan = 'et_ork_info_ea_ork_plan', // Информация
    info_expired = 'et_ork_info_ea_ork_expired', // Информация
    info_done = 'et_ork_info_ea_ork_done', // Информация
    info_pound = 'et_ork_info_ea_ork_pound', // Информация
    info_act_noresult_fail = 'et_ork_info_ea_ork_act_noresult_fail', // Информация


    call_doc_plan = 'et_ork_call_doc_ea_ork_plan', // Звонок по документам
    call_doc_expired = 'et_ork_call_doc_ea_ork_expired', // Звонок по документам
    call_doc_done = 'et_ork_call_doc_ea_ork_done', // Звонок по документам
    call_doc_pound = 'et_ork_call_doc_ea_ork_pound', // Звонок по документам
    call_doc_act_noresult_fail = 'et_ork_call_doc_ea_ork_act_noresult_fail', // Звонок по документам

    call_money_plan = 'et_ork_call_money_ea_ork_plan', // Звонок по оплате
    call_money_expired = 'et_ork_call_money_ea_ork_expired', // Звонок по оплате
    call_money_done = 'et_ork_call_money_ea_ork_done', // Звонок по оплате
    call_money_pound = 'et_ork_call_money_ea_ork_pound', // Звонок по оплате
    call_money_act_noresult_fail = 'et_ork_call_money_ea_ork_act_noresult_fail', // Звонок по оплате

    call_collect_plan = 'et_ork_call_collect_ea_ork_plan', // Звонок по задолженности
    call_collect_expired = 'et_ork_call_collect_ea_ork_expired', // Звонок по задолженности
    call_collect_done = 'et_ork_call_collect_ea_ork_done', // Звонок по задолженности
    call_collect_pound = 'et_ork_call_collect_ea_ork_pound', // Звонок по задолженности
    call_collect_act_noresult_fail = 'et_ork_call_collect_ea_ork_act_noresult_fail', // Звонок по задолженности

    info_garant_plan = 'et_ork_info_garant_ea_ork_plan', // Инфоповод Гарант
    info_garant_expired = 'et_ork_info_garant_ea_ork_expired', // Инфоповод Гарант
    info_garant_done = 'et_ork_info_garant_ea_ork_done', // Инфоповод Гарант
    info_garant_pound = 'et_ork_info_garant_ea_ork_pound', // Инфоповод Гарант
    info_garant_act_noresult_fail = 'et_ork_info_garant_ea_ork_act_noresult_fail', // Инфоповод Гарант

    presentation_plan = 'et_ork_presentation_ea_ork_plan', // Презентация
    presentation_expired = 'et_ork_presentation_ea_ork_expired', // Презентация
    presentation_done = 'et_ork_presentation_ea_ork_done', // Презентация
    presentation_pound = 'et_ork_presentation_ea_ork_pound', // Презентация
    presentation_act_noresult_fail = 'et_ork_presentation_ea_ork_act_noresult_fail', // Презентация

    presentati_plan = 'et_ork_presentation_uniq_ea_ork_plan', // Презентация(уникальная)
    presentati_expired = 'et_ork_presentation_uniq_ea_ork_expired', // Презентация(уникальная)
    presentati_done = 'et_ork_presentation_uniq_ea_ork_done', // Презентация(уникальная)
    presentati_pound = 'et_ork_presentation_uniq_ea_ork_pound', // Презентация(уникальная)
    presentati_act_noresult_fail = 'et_ork_presentation_uniq_ea_ork_act_noresult_fail', // Презентация(уникальная)

    edu_first_plan = 'et_ork_edu_first_ea_ork_plan', // Обучение первичное
    edu_first_expired = 'et_ork_edu_first_ea_ork_expired', // Обучение первичное
    edu_first_done = 'et_ork_edu_first_ea_ork_done', // Обучение первичное
    edu_first_pound = 'et_ork_edu_first_ea_ork_pound', // Обучение первичное
    edu_first_act_noresult_fail = 'et_ork_edu_first_ea_ork_act_noresult_fail', // Обучение первичное

    edu_plan = 'et_ork_edu_ea_ork_plan', // Обучение
    edu_expired = 'et_ork_edu_ea_ork_expired', // Обучение
    edu_done = 'et_ork_edu_ea_ork_done', // Обучение
    edu_pound = 'et_ork_edu_ea_ork_pound', // Обучение
    edu_act_noresult_fail = 'et_ork_edu_ea_ork_act_noresult_fail', // Обучение

    complect_up_work_plan = 'et_ork_complect_up_work_ea_ork_plan', // Работа по увеличению комплекта
    complect_up_work_expired = 'et_ork_complect_up_work_ea_ork_expired', // Работа по увеличению комплекта
    complect_up_work_done = 'et_ork_complect_up_work_ea_ork_done', // Работа по увеличению комплекта
    complect_up_work_pound = 'et_ork_complect_up_work_ea_ork_pound', // Работа по увеличению комплекта
    complect_up_work_act_noresult_fail = 'et_ork_complect_up_work_ea_ork_act_noresult_fail', // Работа по увеличению комплекта


    pere_contract_plan = 'et_ork_pere_contract_ea_ork_plan', // Перезаключение
    pere_contract_expired = 'et_ork_pere_contract_ea_ork_expired', // Перезаключение
    pere_contract_done = 'et_ork_pere_contract_ea_ork_done', // Перезаключение
    pere_contract_pound = 'et_ork_pere_contract_ea_ork_pound', // Перезаключение
    pere_contract_act_noresult_fail = 'et_ork_pere_contract_ea_ork_act_noresult_fail', // Перезаключение

    complect_up_plan = 'et_ork_complect_up_ea_ork_plan', // Увеличение комплекта
    complect_up_expired = 'et_ork_complect_up_ea_ork_expired', // Увеличение комплекта
    complect_up_done = 'et_ork_complect_up_ea_ork_done', // Увеличение комплекта
    complect_up_pound = 'et_ork_complect_up_ea_ork_pound', // Увеличение комплекта
    complect_up_act_noresult_fail = 'et_ork_complect_up_ea_ork_act_noresult_fail', // Увеличение комплекта


    complect_down_plan = 'et_ork_complect_down_ea_ork_plan', // Уменьшение комплекта
    complect_down_expired = 'et_ork_complect_down_ea_ork_expired', // Уменьшение комплекта
    complect_down_done = 'et_ork_complect_down_ea_ork_done', // Уменьшение комплекта
    complect_down_pound = 'et_ork_complect_down_ea_ork_pound', // Уменьшение комплекта
    complect_down_act_noresult_fail = 'et_ork_complect_down_ea_ork_act_noresult_fail', // Уменьшение комплекта


    fail_prevention_plan = 'et_ork_fail_prevention_ea_ork_plan', // Профилактика отказа
    fail_prevention_expired = 'et_ork_fail_prevention_ea_ork_expired', // Профилактика отказа
    fail_prevention_done = 'et_ork_fail_prevention_ea_ork_done', // Профилактика отказа
    fail_prevention_pound = 'et_ork_fail_prevention_ea_ork_pound', // Профилактика отказа
    fail_prevention_act_noresult_fail = 'et_ork_fail_prevention_ea_ork_act_noresult_fail', // Профилактика отказа

    fail_work_plan = 'et_ork_fail_work_ea_ork_plan', // Работа по устранению угрозы отказа
    fail_work_expired = 'et_ork_fail_work_ea_ork_expired', // Работа по устранению угрозы отказа
    fail_work_done = 'et_ork_fail_work_ea_ork_done', // Работа по устранению угрозы отказа
    fail_work_pound = 'et_ork_fail_work_ea_ork_pound', // Работа по устранению угрозы отказа
    fail_work_act_noresult_fail = 'et_ork_fail_work_ea_ork_act_noresult_fail', // Работа по устранению угрозы отказа

    threat_ea_plan = 'et_ork_threat_ea_ork_plan', // Возникновение угрозы отказа
    threat_ea_expired = 'et_ork_threat_ea_ork_expired', // Возникновение угрозы отказа
    threat_ea_done = 'et_ork_threat_ea_ork_done', // Возникновение угрозы отказа
    threat_ea_pound = 'et_ork_threat_ea_ork_pound', // Возникновение угрозы отказа
    threat_ea_act_noresult_fail = 'et_ork_threat_ea_ork_act_noresult_fail', // Возникновение угрозы отказа

    fail_work_success_plan = 'et_ork_fail_work_success_ea_ork_plan', // Устранение угрозы отказа
    fail_work_success_expired = 'et_ork_fail_work_success_ea_ork_expired', // Устранение угрозы отказа
    fail_work_success_done = 'et_ork_fail_work_success_ea_ork_done', // Устранение угрозы отказа
    fail_work_success_pound = 'et_ork_fail_work_success_ea_ork_pound', // Устранение угрозы отказа
    fail_work_success_act_noresult_fail = 'et_ork_fail_work_success_ea_ork_act_noresult_fail', // Устранение угрозы отказа



}
