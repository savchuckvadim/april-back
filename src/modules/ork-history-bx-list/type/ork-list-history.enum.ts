// нфо	appType	type field_code
// Название	calling	string	event_title
// Компания	calling	crm	ork_crm_company
// Дата	calling	datetime	ork_event_date


// Тип События	calling	enumeration	ork_event_type
// Событие	calling	enumeration	ork_event_action
// Тип коммуникации	calling	enumeration	event_communication
// Инициатива	calling	enumeration	ork_event_initiative
// Ответственный	calling	employee	responsible
// Цель коммуникации	calling	enumeration	ork_event_goal
// Цель достигнута	calling	enumeration	ork_event_is_goal
// Дата следующей коммуникации	calling	datetime	ork_plan_date
// Комментарий	calling	string	manager_comment
// Результативность	calling	enumeration	ork_result_status
// Тип Нерезультативности	calling	enumeration	ork_noresult_reason
// ОРК Статус работы в компании	calling	enumeration	ork_work_status
// ОРК Прогноз	calling	enumeration	ork_forecast
// ОРК Причина Отказа	calling	enumeration	ork_fail_reason
// Автор	calling	employee	author
// Соисполнитель	calling	employee	su
// CRM	calling	crm	crm
// Контакт	calling	crm	ork_crm_contact
// Тэг	calling	string	ork_evemt_tag

// enumeration items
// item_name	field_code	item_code
// Сервисный сигнал	ork_event_type	et_ork_signal
// Информация	ork_event_type	et_ork_info
// Звонок по документам	ork_event_type	et_ork_call_doc
// Звонок по оплате	ork_event_type	et_ork_call_money
// Звонок по задолженности	ork_event_type	et_ork_call_collect
// Инфоповод Гарант	ork_event_type	et_ork_info_garant
// Презентация	ork_event_type	et_ork_presentation
// Презентация(уникальная)	ork_event_type	et_ork_presentation_uniq
// Обучение первичное	ork_event_type	et_ork_edu_first
// Обучение	ork_event_type	et_ork_edu
// Обучение(уникальное)	ork_event_type	et_ork_edu_uniq
// Работа по увеличению комплекта	ork_event_type	et_ork_edu_uniq
// Семинар	ork_event_type	et_ork_seminar
// Работа по перезаключению	ork_event_type	et_ork_complect_up_work
// Перезаключение	ork_event_type	et_ork_pere_contract
// Увеличение комплекта 	ork_event_type	et_ork_complect_up
// Уменьшение комплекта / понижение ОД	ork_event_type	et_ork_complect_down
// Профилактика отказа	ork_event_type	et_ork_fail_prevention
// Работа по устранению угрозы отказа	ork_event_type	et_ork_fail_work
// Возникновение угрозы отказа	ork_event_type	et_ork_threat
// Устранение угрозы отказа	ork_event_type	et_ork_fail_work_success
// Заявка с сайта	ork_event_type	et_ork_site
// Коммерческое Предложение	ork_event_type	et_ork_offer
// Счет	ork_event_type	et_ork_invoice
// Договор	ork_event_type	et_ork_contract
// Поставка	ork_event_type	et_ork_supply
// Допродажа	ork_event_type	et_ork_halfsale
// Продажа	ork_event_type	ev_success
// Акт	ork_event_type	et_ork_doc_akt
// Отказ	ork_event_type	et_ork_fail
// Возврат	ork_event_type	et_ork_return



// Создан	ork_event_action	ea_ork_act_create
// Запланирован	ork_event_action	ea_ork_plan
// Просрочен	ork_event_action	ea_ork_expired
// Состоялся	ork_event_action	ea_ork_done
// Перенос	ork_event_action	ea_ork_pound
// Не состоялся	ork_event_action	ea_ork_act_noresult_fail
// Заявка отправлена	ork_event_action	ea_ork_act_init_send
// Заявка принята	ork_event_action	ea_ork_act_init_done
// Отправлен	ork_event_action	ea_ork_act_send
// Подписан	ork_event_action	ea_ork_act_sign
// Сдан	ork_event_action	ea_ork_act_in_office
// Оплачен	ork_event_action	ea_ork_act_pay


// Звонок	event_communication	ec_ork_call
// Выезд	event_communication	ec_ork_face
// Письмо	event_communication	ec_ork_mail
// ЭДО	event_communication	ec_ork_edo
// СС	event_communication	ec_ork_signal


// Входящий	ork_event_initiative	ei_ork_incoming
// Исходящий	ork_event_initiative	ei_ork_outgoing


// Новый	ork_work_status	ork_work_status_new
// Поставка	ork_work_status	ork_work_status_supply
// Первичное обучение	ork_work_status	ork_work_status_first_edu
// Обучение	ork_work_status	ork_work_status_edu
// В работе	ork_work_status	ork_work_status_in_work
// Отработка сигнала	ork_work_status	ork_work_status_signal
// Скоро перезаключение	ork_work_status	ork_work_status_pere_soon
// Перезаключение	ork_work_status	ork_work_status_pere
// Увеличение комплекта	ork_work_status	ork_work_status_complect_up
// Уменьшение комплекта	ork_work_status	ork_work_status_complect_down
// Угроза отказа	ork_work_status	ork_work_status_threat
// В процессе отказа	ork_work_status	ork_work_status_fail_in_process
// Отказ	ork_work_status	ork_work_status_fail
// Продолжение сотрудничества	ork_forecast	ork_forecast_client
// Увеличение комплекта	ork_forecast	ork_forecast_complect_up
// Уменьшение комплекта	ork_forecast	ork_forecast_complect_down
// Угроза отказа	ork_forecast	ork_forecast_maybefail
// Отказ	ork_forecast	ork_forecast_fail
// Смена ЛПР	ork_fail_reason	ork_fr_lpr_changed
// Изменение бюджета	ork_fail_reason	ork_fr_nomoney_plan
// Конкуренты - оплачено	ork_fail_reason	ork_fr_concurent_money
// Конкуренты - цена	ork_fail_reason	ork_fr_lpr_concurent_money
// Нет денег	ork_fail_reason	ork_fr_nomoney
// Не видят надобности	ork_fail_reason	ork_fr_lpr_noneeds
// ЛПР против	ork_fail_reason	ork_fr_lpr
// Ключевой сотрудник против	ork_fail_reason	ork_fr_emploee_noneed
// Не хотят общаться	ork_fail_reason	ork_fr_nocommunication
// Реорганизация	ork_fail_reason	ork_fr_company_changed
// Компания не существует	ork_fail_reason	ork_fr_company_bankrot
// Да	ork_result_status	ork_call_result_yes
// Нет	ork_result_status	ork_call_result_no
// Отработка сигнала	ork_event_goal	eg_ork_signal
// Обучение	ork_event_goal	eg_ork_edu
// Презентация	ork_event_goal	eg_ork_pres
// Перезаключение	ork_event_goal	eg_ork_soon
// Сохранение	ork_event_goal	eg_ork_save
// Отработка рекламации	ork_event_goal	eg_ork_claim
// Да	ork_event_is_goal	ork_event_is_goal_yes
// Нет	ork_event_is_goal	ork_event_is_goal_no
// Секретарь 	ork_noresult_reason	secretar
// Недозвон - трубку не берут	ork_noresult_reason	nopickup
// Недозвон - номер не существует	ork_noresult_reason	nonumber
// Занято 	ork_noresult_reason	busy
// Перенос - не было времени	ork_noresult_reason	noresult_notime
// Контактера нет на месте	ork_noresult_reason	nocontact
// Просят оставить свой номер	ork_noresult_reason	giveup
// Не интересует, до свидания	ork_noresult_reason	bay
// По телефону отвечает не та организация	ork_noresult_reason	wrong
// Автоответчик	ork_noresult_reason	auto

export enum EnumOrkFieldCode{
    event_title = 'service_ork_history_event_title',
    ork_crm_company = 'service_ork_history_ork_crm_company',
    ork_event_date = 'service_ork_history_ork_event_date',
    ork_event_type = 'service_ork_history_ork_event_type',
    ork_event_action = 'service_ork_history_ork_event_action',
    event_communication = 'service_ork_history_event_communication',
    ork_event_initiative = 'service_ork_history_ork_event_initiative',
    responsible = 'service_ork_history_responsible',
    ork_event_goal = 'service_ork_history_ork_event_goal',
    ork_event_is_goal = 'service_ork_history_ork_event_is_goal',

    ork_plan_date = 'service_ork_history_ork_plan_date',
    manager_comment = 'service_ork_history_manager_comment',
    ork_result_status = 'service_ork_history_ork_result_status',
    ork_noresult_reason = 'service_ork_history_ork_noresult_reason',
    ork_work_status = 'service_ork_work_status',
    ork_forecast = 'service_ork_forecast',
    ork_fail_reason = 'service_ork_fail_reason',
    author = 'service_author',
    su = 'service_su',
    crm = 'service_crm',
    ork_crm_contact = 'service_ork_crm_contact',
    ork_evemt_tag = 'service_ork_evemt_tag',
}

export enum EnumOrkEventType{
    et_ork_signal = 'et_ork_signal',
    et_ork_info = 'et_ork_info',
    et_ork_call_doc = 'et_ork_call_doc',
    et_ork_call_money = 'et_ork_call_money',
    et_ork_call_collect = 'et_ork_call_collect',
    et_ork_info_garant = 'et_ork_info_garant',
    et_ork_presentation = 'et_ork_presentation',
    et_ork_presentation_uniq = 'et_ork_presentation_uniq',
    et_ork_edu_first = 'et_ork_edu_first',
    et_ork_edu = 'et_ork_edu',
    et_ork_edu_uniq = 'et_ork_edu_uniq',
    et_ork_seminar = 'et_ork_seminar',
    et_ork_complect_up_work = 'et_ork_complect_up_work',
    et_ork_pere_contract = 'et_ork_pere_contract',
    et_ork_complect_up = 'et_ork_complect_up',
    et_ork_complect_down = 'et_ork_complect_down',
    et_ork_fail_prevention = 'et_ork_fail_prevention',
    et_ork_fail_work = 'et_ork_fail_work',
    et_ork_threat = 'et_ork_threat',
    et_ork_fail_work_success = 'et_ork_fail_work_success',
    et_ork_site = 'et_ork_site',
    et_ork_offer = 'et_ork_offer',
    et_ork_invoice = 'et_ork_invoice',
    et_ork_contract = 'et_ork_contract',
    et_ork_supply = 'et_ork_supply',
    et_ork_halfsale = 'et_ork_halfsale',
    et_ork_success = 'et_ork_success',
    et_ork_doc_akt = 'et_ork_doc_akt',
    et_ork_fail = 'et_ork_fail',
    et_ork_return = 'et_ork_return',
    ev_success = 'ev_success',
}
export enum EnumOrkEventAction {
    ea_ork_act_create = 'ea_ork_act_create',
    ea_ork_plan = 'ea_ork_plan',
    ea_ork_expired = 'ea_ork_expired',
    ea_ork_done = 'ea_ork_done',
    ea_ork_pound = 'ea_ork_pound',
    ea_ork_act_noresult_fail = 'ea_ork_act_noresult_fail',
    ea_ork_act_init_send = 'ea_ork_act_init_send',
    ea_ork_act_init_done = 'ea_ork_act_init_done',
    ea_ork_act_send = 'ea_ork_act_send',
    ea_ork_act_sign = 'ea_ork_act_sign',
    ea_ork_act_in_office = 'ea_ork_act_in_office',
    ea_ork_act_pay = 'ea_ork_act_pay',
    ea_ork_act_close = 'ea_ork_act_close',
    ea_ork_act_close_done = 'ea_ork_act_close_done',
    ea_ork_act_close_noresult_fail = 'ea_ork_act_close_noresult_fail',
    ea_ork_act_close_init_send = 'ea_ork_act_close_init_send',
    ea_ork_act_close_init_done = 'ea_ork_act_close_init_done',
    ea_ork_act_close_send = 'ea_ork_act_close_send',
    ea_ork_act_close_sign = 'ea_ork_act_close_sign',
    ea_ork_act_close_in_office = 'ea_ork_act_close_in_office',
    ea_ork_act_close_pay = 'ea_ork_act_close_pay',
}

export enum EnumOrkEventCommunication {
    ec_ork_call = 'ec_ork_call',
    ec_ork_face = 'ec_ork_face',
    ec_ork_mail = 'ec_ork_mail',
    ec_ork_edo = 'ec_ork_edo',
    ec_ork_signal = 'ec_ork_signal',
}
export enum EnumOrkEventInitiative {
    ei_ork_incoming = 'ei_ork_incoming',
    ei_ork_outgoing = 'ei_ork_outgoing',
}
export enum EnumOrkWorkStatus {
    ork_work_status_new = 'ork_work_status_new',
    ork_work_status_supply = 'ork_work_status_supply',
    ork_work_status_first_edu = 'ork_work_status_first_edu',
    ork_work_status_edu = 'ork_work_status_edu',
    ork_work_status_in_work = 'ork_work_status_in_work',
    ork_work_status_signal = 'ork_work_status_signal',
    ork_work_status_pere_soon = 'ork_work_status_pere_soon',
    ork_work_status_pere = 'ork_work_status_pere',
    ork_work_status_complect_up = 'ork_work_status_complect_up',
    ork_work_status_complect_down = 'ork_work_status_complect_down',
    ork_work_status_threat = 'ork_work_status_threat',
    ork_work_status_fail_in_process = 'ork_work_status_fail_in_process',
    ork_work_status_fail = 'ork_work_status_fail',
}
export enum EnumOrkForecast {
    ork_forecast_client = 'ork_forecast_client',
    ork_forecast_complect_up = 'ork_forecast_complect_up',
    ork_forecast_complect_down = 'ork_forecast_complect_down',
    ork_forecast_maybefail = 'ork_forecast_maybefail',
    ork_forecast_fail = 'ork_forecast_fail',
}
export enum EnumOrkFailReason {
    ork_fr_lpr_changed = 'ork_fr_lpr_changed',
    ork_fr_nomoney_plan = 'ork_fr_nomoney_plan',
    ork_fr_concurent_money = 'ork_fr_concurent_money',
    ork_fr_lpr_concurent_money = 'ork_fr_lpr_concurent_money',
    ork_fr_nomoney = 'ork_fr_nomoney',
    ork_fr_lpr_noneeds = 'ork_fr_lpr_noneeds',
    ork_fr_lpr = 'ork_fr_lpr',
    ork_fr_emploee_noneed = 'ork_fr_emploee_noneed',
    ork_fr_nocommunication = 'ork_fr_nocommunication',
    ork_fr_company_changed = 'ork_fr_company_changed',
    ork_fr_company_bankrot = 'ork_fr_company_bankrot',
}
export enum EnumOrkResultStatus {
    ork_call_result_yes = 'ork_call_result_yes',
    ork_call_result_no = 'ork_call_result_no',
}


