import { EnumOrkEventAction, EnumOrkEventType, OrkFields } from "@/modules/ork-history-bx-list"





// export type FilterCode = EnumFilterCode
    // | 'et_ork_signal_ea_ork_plan' //Сервисный сигнал
    // | 'et_ork_signal_ea_ork_expired' // Сервисный сигнал
    // | 'et_ork_signal_ea_ork_done' // Сервисный сигнал
    // | 'et_ork_signal_ea_ork_pound' // Сервисный сигнал
    // | 'et_ork_signal_ea_ork_act_noresult_fail' // Сервисный сигнал

    // | 'et_ork_info_ea_ork_plan' // Информация
    // | 'et_ork_info_ea_ork_expired' // Информация
    // | 'et_ork_info_ea_ork_done' // Информация
    // | 'et_ork_info_ea_ork_pound' // Информация
    // | 'et_ork_info_ea_ork_act_noresult_fail' // Информация


    // | 'et_ork_call_doc_ea_ork_plan' // Звонок по документам
    // | 'et_ork_call_doc_ea_ork_expired' // Звонок по документам
    // | 'et_ork_call_doc_ea_ork_done' // Звонок по документам
    // | 'et_ork_call_doc_ea_ork_pound' // Звонок по документам
    // | 'et_ork_call_doc_ea_ork_act_noresult_fail' // Звонок по документам

    // | 'et_ork_call_money_ea_ork_plan' // Звонок по оплате
    // | 'et_ork_call_money_ea_ork_expired' // Звонок по оплате
    // | 'et_ork_call_money_ea_ork_done' // Звонок по оплате
    // | 'et_ork_call_money_ea_ork_pound' // Звонок по оплате
    // | 'et_ork_call_money_ea_ork_act_noresult_fail' // Звонок по оплате

    // | 'et_ork_call_collect_ea_ork_plan' // Звонок по задолженности
    // | 'et_ork_call_collect_ea_ork_expired' // Звонок по задолженности
    // | 'et_ork_call_collect_ea_ork_done' // Звонок по задолженности
    // | 'et_ork_call_collect_ea_ork_pound' // Звонок по задолженности
    // | 'et_ork_call_collect_ea_ork_act_noresult_fail' // Звонок по задолженности

    // | 'et_ork_info_garant_ea_ork_plan' // Инфоповод Гарант
    // | 'et_ork_info_garant_ea_ork_expired' // Инфоповод Гарант
    // | 'et_ork_info_garant_ea_ork_done' // Инфоповод Гарант
    // | 'et_ork_info_garant_ea_ork_pound' // Инфоповод Гарант
    // | 'et_ork_info_garant_ea_ork_act_noresult_fail' // Инфоповод Гарант

    // | 'et_ork_presentation_ea_ork_plan' // Презентация
    // | 'et_ork_presentation_ea_ork_expired' // Презентация
    // | 'et_ork_presentation_ea_ork_done' // Презентация
    // | 'et_ork_presentation_ea_ork_pound' // Презентация
    // | 'et_ork_presentation_ea_ork_act_noresult_fail' // Презентация

    // | 'et_ork_presentation_uniq_ea_ork_plan' // Презентация(уникальная)
    // | 'et_ork_presentation_uniq_ea_ork_expired' // Презентация(уникальная)
    // | 'et_ork_presentation_uniq_ea_ork_done' // Презентация(уникальная)
    // | 'et_ork_presentation_uniq_ea_ork_pound' // Презентация(уникальная)
    // | 'et_ork_presentation_uniq_ea_ork_act_noresult_fail' // Презентация(уникальная)

    // | 'et_ork_edu_first_ea_ork_plan' // Обучение первичное
    // | 'et_ork_edu_first_ea_ork_expired' // Обучение первичное
    // | 'et_ork_edu_first_ea_ork_done' // Обучение первичное
    // | 'et_ork_edu_first_ea_ork_pound' // Обучение первичное
    // | 'et_ork_edu_first_ea_ork_act_noresult_fail' // Обучение первичное

    // | 'et_ork_edu_ea_ork_plan' // Обучение
    // | 'et_ork_edu_ea_ork_expired' // Обучение
    // | 'et_ork_edu_ea_ork_done' // Обучение
    // | 'et_ork_edu_ea_ork_pound' // Обучение
    // | 'et_ork_edu_ea_ork_act_noresult_fail' // Обучение

    // | 'et_ork_complect_up_work_ea_ork_plan' // Работа по увеличению комплекта
    // | 'et_ork_complect_up_work_ea_ork_expired' // Работа по увеличению комплекта
    // | 'et_ork_complect_up_work_ea_ork_done' // Работа по увеличению комплекта
    // | 'et_ork_complect_up_work_ea_ork_pound' // Работа по увеличению комплекта
    // | 'et_ork_complect_up_work_ea_ork_act_noresult_fail' // Работа по увеличению комплекта


    // | 'et_ork_pere_contract_ea_ork_plan' // Перезаключение
    // | 'et_ork_pere_contract_ea_ork_expired' // Перезаключение
    // | 'et_ork_pere_contract_ea_ork_done' // Перезаключение
    // | 'et_ork_pere_contract_ea_ork_pound' // Перезаключение
    // | 'et_ork_pere_contract_ea_ork_act_noresult_fail' // Перезаключение

    // | 'et_ork_complect_up_ea_ork_plan' // Увеличение комплекта
    // | 'et_ork_complect_up_ea_ork_expired' // Увеличение комплекта
    // | 'et_ork_complect_up_ea_ork_done' // Увеличение комплекта
    // | 'et_ork_complect_up_ea_ork_pound' // Увеличение комплекта
    // | 'et_ork_complect_up_ea_ork_act_noresult_fail' // Увеличение комплекта


    // | 'et_ork_complect_down_ea_ork_plan' // Уменьшение комплекта
    // | 'et_ork_complect_down_ea_ork_expired' // Уменьшение комплекта
    // | 'et_ork_complect_down_ea_ork_done' // Уменьшение комплекта
    // | 'et_ork_complect_down_ea_ork_pound' // Уменьшение комплекта
    // | 'et_ork_complect_down_ea_ork_act_noresult_fail' // Уменьшение комплекта


    // | 'et_ork_fail_prevention_ea_ork_plan' // Профилактика отказа
    // | 'et_ork_fail_prevention_ea_ork_expired' // Профилактика отказа
    // | 'et_ork_fail_prevention_ea_ork_done' // Профилактика отказа
    // | 'et_ork_fail_prevention_ea_ork_pound' // Профилактика отказа
    // | 'et_ork_fail_prevention_ea_ork_act_noresult_fail' // Профилактика отказа

    // | 'et_ork_fail_work_ea_ork_plan' // Работа по устранению угрозы отказа
    // | 'et_ork_fail_work_ea_ork_expired' // Работа по устранению угрозы отказа
    // | 'et_ork_fail_work_ea_ork_done' // Работа по устранению угрозы отказа
    // | 'et_ork_fail_work_ea_ork_pound' // Работа по устранению угрозы отказа
    // | 'et_ork_fail_work_ea_ork_act_noresult_fail' // Работа по устранению угрозы отказа

    // | 'et_ork_threat_ea_ork_plan' // Возникновение угрозы отказа
    // | 'et_ork_threat_ea_ork_expired' // Возникновение угрозы отказа
    // | 'et_ork_threat_ea_ork_done' // Возникновение угрозы отказа
    // | 'et_ork_threat_ea_ork_pound' // Возникновение угрозы отказа
    // | 'et_ork_threat_ea_ork_act_noresult_fail' // Возникновение угрозы отказа

    // | 'et_ork_fail_work_success_ea_ork_plan' // Устранение угрозы отказа
    // | 'et_ork_fail_work_success_ea_ork_expired' // Устранение угрозы отказа
    // | 'et_ork_fail_work_success_ea_ork_done' // Устранение угрозы отказа
    // | 'et_ork_fail_work_success_ea_ork_pound' // Устранение угрозы отказа
    // | 'et_ork_fail_work_success_ea_ork_act_noresult_fail' // Устранение угрозы отказа


// | FilterCode

// | 'et_ork_call_ea_ork_plan' // Звонок по оплате
// | 'et_ork_call_ea_ork_expired' // Звонок по оплате
// | 'et_ork_call_ea_ork_done' // Звонок по оплате
// | 'et_ork_call_ea_ork_pound' // Звонок по оплате
// | 'et_ork_call_ea_ork_act_noresult_fail' // Звонок по оплате;


export enum EnumOrkFilterInnerCode {
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



    supply_done = 'et_ork_supply_ea_ork_done', // Поставка
    fail = 'et_ork_fail_ea_ork_done', // Отказ


}


export enum EnumOrkFilterCode {
    signal_plan = `${EnumOrkEventType.et_ork_signal}_${EnumOrkEventAction.ea_ork_plan}`, //Сервисный сигнал
    signal_act_create = `${EnumOrkEventType.et_ork_signal}_${EnumOrkEventAction.ea_ork_act_create}`, //Сервисный сигнал
    signal_expired = `${EnumOrkEventType.et_ork_signal}_${EnumOrkEventAction.ea_ork_expired}`, // Сервисный сигнал
    signal_done = `${EnumOrkEventType.et_ork_signal}_${EnumOrkEventAction.ea_ork_done}`, // Сервисный сигнал
    signal_pound = `${EnumOrkEventType.et_ork_signal}_${EnumOrkEventAction.ea_ork_pound}`, // Сервисный сигнал
    signal_act_noresult_fail = `${EnumOrkEventType.et_ork_signal}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Сервисный сигнал

    info_plan = `${EnumOrkEventType.et_ork_info}_${EnumOrkEventAction.ea_ork_plan}`, // Информация
    info_expired = `${EnumOrkEventType.et_ork_info}_${EnumOrkEventAction.ea_ork_expired}`, // Информация
    info_done = `${EnumOrkEventType.et_ork_info}_${EnumOrkEventAction.ea_ork_done}`, // Информация
    info_pound = `${EnumOrkEventType.et_ork_info}_${EnumOrkEventAction.ea_ork_pound}`, // Информация
    info_act_noresult_fail = `${EnumOrkEventType.et_ork_info}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Информация


    call_doc_plan = `${EnumOrkEventType.et_ork_call_doc}_${EnumOrkEventAction.ea_ork_plan}`, // Звонок по документам
    call_doc_expired = `${EnumOrkEventType.et_ork_call_doc}_${EnumOrkEventAction.ea_ork_expired}`, // Звонок по документам
    call_doc_done = `${EnumOrkEventType.et_ork_call_doc}_${EnumOrkEventAction.ea_ork_done}`, // Звонок по документам
    call_doc_pound = `${EnumOrkEventType.et_ork_call_doc}_${EnumOrkEventAction.ea_ork_pound}`, // Звонок по документам
    call_doc_act_noresult_fail = `${EnumOrkEventType.et_ork_call_doc}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Звонок по документам

    call_money_plan = `${EnumOrkEventType.et_ork_call_money}_${EnumOrkEventAction.ea_ork_plan}`, // Звонок по оплате
    call_money_expired = `${EnumOrkEventType.et_ork_call_money}_${EnumOrkEventAction.ea_ork_expired}`, // Звонок по оплате
    call_money_done = `${EnumOrkEventType.et_ork_call_money}_${EnumOrkEventAction.ea_ork_done}`, // Звонок по оплате
    call_money_pound = `${EnumOrkEventType.et_ork_call_money}_${EnumOrkEventAction.ea_ork_pound}`, // Звонок по оплате
    call_money_act_noresult_fail = `${EnumOrkEventType.et_ork_call_money}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Звонок по оплате

    call_collect_plan = `${EnumOrkEventType.et_ork_call_collect}_${EnumOrkEventAction.ea_ork_plan}`, // Звонок по задолженности
    call_collect_expired = `${EnumOrkEventType.et_ork_call_collect}_${EnumOrkEventAction.ea_ork_expired}`, // Звонок по задолженности
    call_collect_done = `${EnumOrkEventType.et_ork_call_collect}_${EnumOrkEventAction.ea_ork_done}`, // Звонок по задолженности
    call_collect_pound = `${EnumOrkEventType.et_ork_call_collect}_${EnumOrkEventAction.ea_ork_pound}`, // Звонок по задолженности
    call_collect_act_noresult_fail = `${EnumOrkEventType.et_ork_call_collect}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Звонок по задолженности

    info_garant_plan = `${EnumOrkEventType.et_ork_info_garant}_${EnumOrkEventAction.ea_ork_plan}`, // Инфоповод Гарант
    info_garant_expired = `${EnumOrkEventType.et_ork_info_garant}_${EnumOrkEventAction.ea_ork_expired}`, // Инфоповод Гарант
    info_garant_done = `${EnumOrkEventType.et_ork_info_garant}_${EnumOrkEventAction.ea_ork_done}`, // Инфоповод Гарант
    info_garant_pound = `${EnumOrkEventType.et_ork_info_garant}_${EnumOrkEventAction.ea_ork_pound}`, // Инфоповод Гарант
    info_garant_act_noresult_fail = `${EnumOrkEventType.et_ork_info_garant}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Инфоповод Гарант

    presentation_plan = `${EnumOrkEventType.et_ork_presentation}_${EnumOrkEventAction.ea_ork_plan}`, // Презентация
    presentation_expired = `${EnumOrkEventType.et_ork_presentation}_${EnumOrkEventAction.ea_ork_expired}`, // Презентация
    presentation_done = `${EnumOrkEventType.et_ork_presentation}_${EnumOrkEventAction.ea_ork_done}`, // Презентация
    presentation_pound = `${EnumOrkEventType.et_ork_presentation}_${EnumOrkEventAction.ea_ork_pound}`,
    presentation_act_noresult_fail = `${EnumOrkEventType.et_ork_presentation}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Презентация

    presentati_plan = `${EnumOrkEventType.et_ork_presentation_uniq}_${EnumOrkEventAction.ea_ork_plan}`,  // Презентация(уникальная)
    presentati_expired = `${EnumOrkEventType.et_ork_presentation_uniq}_${EnumOrkEventAction.ea_ork_expired}`, // Презентация // Презентация(уникальная)
    presentati_done = `${EnumOrkEventType.et_ork_presentation_uniq}_${EnumOrkEventAction.ea_ork_done}`, // Презентация // Презентация(уникальная)
    presentati_pound = `${EnumOrkEventType.et_ork_presentation_uniq}_${EnumOrkEventAction.ea_ork_expired}`, // Презентация(уникальная)
    presentati_act_noresult_fail = `${EnumOrkEventType.et_ork_presentation_uniq}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Презентация, // Презентация(уникальная)

    edu_first_plan = `${EnumOrkEventType.et_ork_edu_first}_${EnumOrkEventAction.ea_ork_plan}`, // Обучение первичное
    edu_first_expired = `${EnumOrkEventType.et_ork_edu_first}_${EnumOrkEventAction.ea_ork_expired}`, // Обучение первичное
    edu_first_done = `${EnumOrkEventType.et_ork_edu_first}_${EnumOrkEventAction.ea_ork_done}`, // Обучение первичное
    edu_first_pound = `${EnumOrkEventType.et_ork_edu_first}_${EnumOrkEventAction.ea_ork_pound}`, // Обучение первичное
    edu_first_act_noresult_fail = `${EnumOrkEventType.et_ork_edu_first}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Обучение первичное

    edu_plan = `${EnumOrkEventType.et_ork_edu}_${EnumOrkEventAction.ea_ork_plan}`, // Обучение
    edu_expired = `${EnumOrkEventType.et_ork_edu}_${EnumOrkEventAction.ea_ork_expired}`, // Обучение
    edu_done = `${EnumOrkEventType.et_ork_edu}_${EnumOrkEventAction.ea_ork_done}`, // Обучение
    edu_pound = `${EnumOrkEventType.et_ork_edu}_${EnumOrkEventAction.ea_ork_pound}`, // Обучение
    edu_act_noresult_fail = `${EnumOrkEventType.et_ork_edu}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Обучение

    edu_uniq_plan = `${EnumOrkEventType.et_ork_edu_uniq}_${EnumOrkEventAction.ea_ork_plan}`, // Обучение(уникальное)
    edu_uniq_expired = `${EnumOrkEventType.et_ork_edu_uniq}_${EnumOrkEventAction.ea_ork_expired}`, // Обучение(уникальное)
    edu_uniq_done = `${EnumOrkEventType.et_ork_edu_uniq}_${EnumOrkEventAction.ea_ork_done}`, // Обучение(уникальное)
    edu_uniq_pound = `${EnumOrkEventType.et_ork_edu_uniq}_${EnumOrkEventAction.ea_ork_pound}`, // Обучение(уникальное)
    edu_uniq_act_noresult_fail = `${EnumOrkEventType.et_ork_edu_uniq}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Обучение(уникальное)

    complect_up_work_plan = `${EnumOrkEventType.et_ork_complect_up_work}_${EnumOrkEventAction.ea_ork_plan}`, // Работа по увеличению комплекта
    complect_up_work_expired = `${EnumOrkEventType.et_ork_complect_up_work}_${EnumOrkEventAction.ea_ork_expired}`, // Работа по увеличению комплекта
    complect_up_work_done = `${EnumOrkEventType.et_ork_complect_up_work}_${EnumOrkEventAction.ea_ork_done}`, // Работа по увеличению комплекта
    complect_up_work_pound = `${EnumOrkEventType.et_ork_complect_up_work}_${EnumOrkEventAction.ea_ork_pound}`, // Работа по увеличению комплекта
    complect_up_work_act_noresult_fail = `${EnumOrkEventType.et_ork_complect_up_work}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Работа по увеличению комплекта


    pere_contract_plan = `${EnumOrkEventType.et_ork_pere_contract}_${EnumOrkEventAction.ea_ork_plan}`, // Перезаключение
    pere_contract_expired = `${EnumOrkEventType.et_ork_pere_contract}_${EnumOrkEventAction.ea_ork_expired}`, // Перезаключение
    pere_contract_done = `${EnumOrkEventType.et_ork_pere_contract}_${EnumOrkEventAction.ea_ork_done}`, // Перезаключение
    pere_contract_pound = `${EnumOrkEventType.et_ork_pere_contract}_${EnumOrkEventAction.ea_ork_pound}`, // Перезаключение
    pere_contract_act_noresult_fail = `${EnumOrkEventType.et_ork_pere_contract}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Перезаключение

    complect_up_plan = `${EnumOrkEventType.et_ork_complect_up}_${EnumOrkEventAction.ea_ork_plan}`, // Увеличение комплекта
    complect_up_expired = `${EnumOrkEventType.et_ork_complect_up}_${EnumOrkEventAction.ea_ork_expired}`, // Увеличение комплекта
    complect_up_done = `${EnumOrkEventType.et_ork_complect_up}_${EnumOrkEventAction.ea_ork_done}`, // Увеличение комплекта
    complect_up_pound = `${EnumOrkEventType.et_ork_complect_up}_${EnumOrkEventAction.ea_ork_pound}`, // Увеличение комплекта
    complect_up_act_noresult_fail = `${EnumOrkEventType.et_ork_complect_up}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Увеличение комплекта


    complect_down_plan = `${EnumOrkEventType.et_ork_complect_down}_${EnumOrkEventAction.ea_ork_plan}`, // Уменьшение комплекта
    complect_down_expired = `${EnumOrkEventType.et_ork_complect_down}_${EnumOrkEventAction.ea_ork_expired}`, // Уменьшение комплекта
    complect_down_done = `${EnumOrkEventType.et_ork_complect_down}_${EnumOrkEventAction.ea_ork_done}`, // Уменьшение комплекта
    complect_down_pound = `${EnumOrkEventType.et_ork_complect_down}_${EnumOrkEventAction.ea_ork_pound}`, // Уменьшение комплекта
    complect_down_act_noresult_fail = `${EnumOrkEventType.et_ork_complect_down}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Уменьшение комплекта


    fail_prevention_plan = `${EnumOrkEventType.et_ork_fail_prevention}_${EnumOrkEventAction.ea_ork_plan}`, // Профилактика отказа
    fail_prevention_expired = `${EnumOrkEventType.et_ork_fail_prevention}_${EnumOrkEventAction.ea_ork_expired}`, // Профилактика отказа
    fail_prevention_done = `${EnumOrkEventType.et_ork_fail_prevention}_${EnumOrkEventAction.ea_ork_done}`, // Профилактика отказа
    fail_prevention_pound = `${EnumOrkEventType.et_ork_fail_prevention}_${EnumOrkEventAction.ea_ork_pound}`, // Профилактика отказа
    fail_prevention_act_noresult_fail = `${EnumOrkEventType.et_ork_fail_prevention}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Профилактика отказа

    fail_work_plan = `${EnumOrkEventType.et_ork_fail_work}_${EnumOrkEventAction.ea_ork_plan}`, // Работа по устранению угрозы отказа
    fail_work_expired = `${EnumOrkEventType.et_ork_fail_work}_${EnumOrkEventAction.ea_ork_expired}`, // Работа по устранению угрозы отказа
    fail_work_done = `${EnumOrkEventType.et_ork_fail_work}_${EnumOrkEventAction.ea_ork_done}`, // Работа по устранению угрозы отказа
    fail_work_pound = `${EnumOrkEventType.et_ork_fail_work}_${EnumOrkEventAction.ea_ork_pound}`, // Работа по устранению угрозы отказа
    fail_work_act_noresult_fail = `${EnumOrkEventType.et_ork_fail_work}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Работа по устранению угрозы отказа

    threat_ea_plan = `${EnumOrkEventType.et_ork_threat}_${EnumOrkEventAction.ea_ork_plan}`, // Возникновение угрозы отказа
    threat_ea_expired = `${EnumOrkEventType.et_ork_threat}_${EnumOrkEventAction.ea_ork_expired}`, // Возникновение угрозы отказа
    threat_ea_done = `${EnumOrkEventType.et_ork_threat}_${EnumOrkEventAction.ea_ork_done}`, // Возникновение угрозы отказа
    threat_ea_pound = `${EnumOrkEventType.et_ork_threat}_${EnumOrkEventAction.ea_ork_pound}`, // Возникновение угрозы отказа
    threat_ea_act_noresult_fail = `${EnumOrkEventType.et_ork_threat}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Возникновение угрозы отказа

    fail_work_success_plan = `${EnumOrkEventType.et_ork_fail_work_success}_${EnumOrkEventAction.ea_ork_plan}`, // Устранение угрозы отказа
    fail_work_success_expired = `${EnumOrkEventType.et_ork_fail_work_success}_${EnumOrkEventAction.ea_ork_expired}`, // Устранение угрозы отказа
    fail_work_success_done = `${EnumOrkEventType.et_ork_fail_work_success}_${EnumOrkEventAction.ea_ork_done}`, // Устранение угрозы отказа
    fail_work_success_pound = `${EnumOrkEventType.et_ork_fail_work_success}_${EnumOrkEventAction.ea_ork_pound}`, // Устранение угрозы отказа
    fail_work_success_act_noresult_fail = `${EnumOrkEventType.et_ork_fail_work_success}_${EnumOrkEventAction.ea_ork_act_noresult_fail}`, // Устранение угрозы отказа


    supply_done = `${EnumOrkEventType.et_ork_supply}_${EnumOrkEventAction.ea_ork_done}`, // Перезаключение договора
    fail = `${EnumOrkEventType.et_ork_fail}_${EnumOrkEventAction.ea_ork_done}`, // Отказ


}


export const OrkReportEventActionItems = {
    [OrkFields.ork_event_action.items.ea_ork_plan.code as EnumOrkEventAction]: {
        [OrkFields.ork_event_type.items.et_ork_signal.code as EnumOrkEventType]: {
            name: 'Сервисный сигнал запланирован',
            code: EnumOrkFilterCode.signal_plan,
            type: 'signal',
            order: 1
        },
        [OrkFields.ork_event_type.items.et_ork_info.code]: {
            name: 'Информация запланирован',
            code: EnumOrkFilterCode.info_plan,
            type: 'info',
            order: 3
        },
        [OrkFields.ork_event_type.items.et_ork_call_doc.code]: {
            name: 'Звонок по документам запланирован',
            code: EnumOrkFilterCode.call_doc_plan,
            type: 'call_doc',
            order: 5
        },
        [OrkFields.ork_event_type.items.et_ork_call_money.code]: {
            name: 'Звонок по оплате запланирован',
            code: EnumOrkFilterCode.call_money_plan,
            type: 'call_money',
            order: 7
        },
        [OrkFields.ork_event_type.items.et_ork_call_collect.code]: {
            name: 'Звонок по задолженности запланирован',
            code: EnumOrkFilterCode.call_collect_plan,
            type: 'call_collect',
            order: 9
        },
        [OrkFields.ork_event_type.items.et_ork_info_garant.code]: {
            name: 'Инфоповод Гарант запланирован',
            code: EnumOrkFilterCode.info_garant_plan,
            type: 'info_garant',
            order: 11
        },
        [OrkFields.ork_event_type.items.et_ork_presentation.code]: {
            name: 'Презентация запланирован',
            code: EnumOrkFilterCode.presentation_plan,
            type: 'presentation',
            order: 13
        },
        [OrkFields.ork_event_type.items.et_ork_presentation_uniq.code]: {
            name: 'Презентация(уникальная) запланирован',
            code: EnumOrkFilterCode.presentati_plan,
            type: 'presentation_uniq',
            order: 15
        },
        [OrkFields.ork_event_type.items.et_ork_edu_first.code]: {
            name: 'Обучение первичное запланировано',
            code: EnumOrkFilterCode.edu_first_plan,
            type: 'edu_first',
            order: 17
        },
        [OrkFields.ork_event_type.items.et_ork_edu.code]: {
            name: 'Обучение запланировано',
            code: EnumOrkFilterCode.edu_first_plan,
            type: 'edu',
            order: 19
        },
        [OrkFields.ork_event_type.items.et_ork_edu_uniq.code]: {
            name: 'Обучение(уникальное) запланировано',
            code: EnumOrkFilterCode.edu_uniq_plan,
            type: 'edu_uniq',
            order: 21
        },
        [OrkFields.ork_event_type.items.et_ork_threat.code]: {
            name: 'Обработка угрозы отказа запланировано',
            code: EnumOrkFilterCode.threat_ea_plan,
            type: 'edu_uniq',
            order: 22
        },
    },
    [OrkFields.ork_event_action.items.ea_ork_done.code as EnumOrkEventAction]: {
        [OrkFields.ork_event_type.items.et_ork_signal.code]: {
            name: 'Сервисный сигнал обработан',
            code: EnumOrkFilterCode.signal_done,
            type: 'signal',
            order: 2
        },
        [OrkFields.ork_event_type.items.et_ork_info.code]: {
            name: 'Информационный звонок совершен',
            code: EnumOrkFilterCode.info_done,
            type: 'info',
            order: 4
        },
        [OrkFields.ork_event_type.items.et_ork_call_doc.code]: {
            name: 'Звонок по документам совершен',
            code: EnumOrkFilterCode.call_doc_done,
            type: 'call_doc',
            order: 6
        },
        [OrkFields.ork_event_type.items.et_ork_call_money.code]: {
            name: 'Звонок по оплате совершен',
            code: EnumOrkFilterCode.call_money_done,
            type: 'call_money',
            order: 8
        },
        [OrkFields.ork_event_type.items.et_ork_call_collect.code]: {
            name: 'Звонок по задолженности совершен',
            code: EnumOrkFilterCode.call_collect_done,
            type: 'call_collect',
            order: 10
        },
        [OrkFields.ork_event_type.items.et_ork_info_garant.code]: {
            name: 'Инфоповод Гарант совершен',
            code: EnumOrkFilterCode.info_garant_done,
            type: 'info_garant',
            order: 12
        },
        [OrkFields.ork_event_type.items.et_ork_presentation.code]: {
            name: 'Презентация проведена',
            code: EnumOrkFilterCode.presentation_done,
            type: 'presentation',
            order: 14
        },
        [OrkFields.ork_event_type.items.et_ork_presentation_uniq.code]: {
            name: 'Презентация(уникальная) проведена',
            code: EnumOrkFilterCode.presentati_done,
            type: 'presentation_uniq',
            order: 16
        },
        [OrkFields.ork_event_type.items.et_ork_edu_first.code]: {
            name: 'Обучение первичное проведено',
            code: EnumOrkFilterCode.edu_first_done,
            type: 'edu_first',
            order: 18
        },
        [OrkFields.ork_event_type.items.et_ork_edu.code]: {
            name: 'Обучение проведено',
            code: EnumOrkFilterCode.edu_done,
            type: 'edu',
            order: 20
        },
        [OrkFields.ork_event_type.items.et_ork_edu_uniq.code]: {
            name: 'Обучение(уникальное) проведено',
            code: EnumOrkFilterCode.edu_uniq_done,
            type: 'edu_uniq',
            order: 21
        },
        [OrkFields.ork_event_type.items.et_ork_threat.code]: {
            name: 'Обработка угрозы отказа проведено',
            code: EnumOrkFilterCode.threat_ea_done,
            type: 'edu_uniq',
            order: 22
        },
        [OrkFields.ork_event_type.items.et_ork_supply.code]: {
            name: 'Перезаключение договора совершено',
            code: EnumOrkFilterCode.supply_done,
            type: 'supply',
            order: 23
        },
        [OrkFields.ork_event_type.items.et_ork_fail.code]: {
            name: 'Отказ',
            code: EnumOrkFilterCode.fail,
            type: 'fail',
            order: 24
        },
    },
    [OrkFields.ork_event_action.items.ea_ork_act_create.code as EnumOrkEventAction]: {
        [OrkFields.ork_event_type.items.et_ork_signal.code as EnumOrkEventType]: {
            name: 'Сервисный сигнал создан',
            code: EnumOrkFilterCode.signal_act_create,
            type: 'signal',
            order: 1
        },
    }
}
