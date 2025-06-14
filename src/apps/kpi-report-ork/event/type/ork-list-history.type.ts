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

export const OrkFields = {
    ork_event_type: {
        name: 'Тип События',
        code: 'ork_event_type',
        items: {
            et_ork_signal: {
                name: 'Сервисный сигнал',
                code: 'et_ork_signal'
            },
            et_ork_info: {
                name: 'Информация',
                code: 'et_ork_info'
            },
            et_ork_call_doc: {
                name: 'Звонок по документам',
                code: 'et_ork_call_doc'
            },
            et_ork_call_money: {
                name: 'Звонок по оплате',
                code: 'et_ork_call_money'
            },
            et_ork_call_collect: {
                name: 'Звонок по задолженности',
                code: 'et_ork_call_collect'
            },
            et_ork_info_garant: {
                name: 'Инфоповод Гарант',
                code: 'et_ork_info_garant'
            },
            et_ork_presentation: {
                name: 'Презентация',
                code: 'et_ork_presentation'
            },
            et_ork_presentation_uniq: {
                name: 'Презентация(уникальная)',
                code: 'et_ork_presentation_uniq'
            },
            et_ork_edu_first: {
                name: 'Обучение первичное',
                code: 'et_ork_edu_first'
            },
            et_ork_edu: {
                name: 'Обучение',
                code: 'et_ork_edu'
            },
            et_ork_edu_uniq: {
                name: 'Обучение(уникальное)',
                code: 'et_ork_edu_uniq'
            },
            et_ork_seminar: {
                name: 'Семинар',
                code: 'et_ork_seminar'
            },
            et_ork_complect_up_work: {
                name: 'Работа по перезаключению',
                code: 'et_ork_complect_up_work'
            },
            et_ork_pere_contract: {
                name: 'Перезаключение',
                code: 'et_ork_pere_contract'
            },
            et_ork_complect_up: {
                name: 'Увеличение комплекта',
                code: 'et_ork_complect_up'
            },
            et_ork_complect_down: {
                name: 'Уменьшение комплекта / понижение ОД',
                code: 'et_ork_complect_down'
            },
            et_ork_fail_prevention: {
                name: 'Профилактика отказа',
                code: 'et_ork_fail_prevention'
            },
            et_ork_fail_work: {
                name: 'Работа по устранению угрозы отказа',
                code: 'et_ork_fail_work'
            },
            et_ork_threat: {
                name: 'Возникновение угрозы отказа',
                code: 'et_ork_threat'
            },
            et_ork_fail_work_success: {
                name: 'Устранение угрозы отказа',
                code: 'et_ork_fail_work_success'
            },
            et_ork_site: {
                name: 'Заявка с сайта',
                code: 'et_ork_site'
            },
            et_ork_offer: {
                name: 'Коммерческое Предложение',
                code: 'et_ork_offer'
            },
            et_ork_invoice: {
                name: 'Счет',
                code: 'et_ork_invoice'
            },
            et_ork_contract: {
                name: 'Договор',
                code: 'et_ork_contract'
            },
            et_ork_supply: {
                name: 'Поставка',
                code: 'et_ork_supply'
            },
            et_ork_halfsale: {
                name: 'Допродажа',
                code: 'et_ork_halfsale'
            },
            ev_success: {
                name: 'Продажа',
                code: 'ev_success'
            },
            et_ork_doc_akt: {
                name: 'Акт',
                code: 'et_ork_doc_akt'
            },
            et_ork_fail: {
                name: 'Отказ',
                code: 'et_ork_fail'
            },
            et_ork_return: {
                name: 'Возврат',
                code: 'et_ork_return'
            }
        }
    },
    ork_event_action: {
        name: 'Событие',
        code: 'ork_event_action',
        items: {
            ea_ork_act_create: {
                name: 'Создан',
                code: 'ea_ork_act_create'
            },
            ea_ork_plan: {
                name: 'Запланирован',
                code: 'ea_ork_plan'
            },
            ea_ork_expired: {
                name: 'Просрочен',
                code: 'ea_ork_expired'
            },
            ea_ork_done: {
                name: 'Состоялся',
                code: 'ea_ork_done'
            },
            ea_ork_pound: {
                name: 'Перенос',
                code: 'ea_ork_pound'
            },
            ea_ork_act_noresult_fail: {
                name: 'Не состоялся',
                code: 'ea_ork_act_noresult_fail'
            },
            ea_ork_act_init_send: {
                name: 'Заявка отправлена',
                code: 'ea_ork_act_init_send'
            },
            ea_ork_act_init_done: {
                name: 'Заявка принята',
                code: 'ea_ork_act_init_done'
            },
            ea_ork_act_send: {
                name: 'Отправлен',
                code: 'ea_ork_act_send'
            },
            ea_ork_act_sign: {
                name: 'Подписан',
                code: 'ea_ork_act_sign'
            },
            ea_ork_act_in_office: {
                name: 'Сдан',
                code: 'ea_ork_act_in_office'
            },
            ea_ork_act_pay: {
                name: 'Оплачен',
                code: 'ea_ork_act_pay'
            }
        }
    },
    event_communication: {
        name: 'Тип коммуникации',
        code: 'event_communication',
        items: {
            ec_ork_call: {
                name: 'Звонок',
                code: 'ec_ork_call'
            },
            ec_ork_face: {
                name: 'Выезд',
                code: 'ec_ork_face'
            },
            ec_ork_mail: {
                name: 'Письмо',
                code: 'ec_ork_mail'
            },
            ec_ork_edo: {
                name: 'ЭДО',
                code: 'ec_ork_edo'
            },
            ec_ork_signal: {
                name: 'СС',
                code: 'ec_ork_signal'
            }
        }
    },
    ork_event_initiative: {
        name: 'Инициатива',
        code: 'ork_event_initiative',
        items: {
            ei_ork_incoming: {
                name: 'Входящий',
                code: 'ei_ork_incoming'
            },
            ei_ork_outgoing: {
                name: 'Исходящий',
                code: 'ei_ork_outgoing'
            }
        }
    },
    ork_work_status: {
        name: 'ОРК Статус работы в компании',
        code: 'ork_work_status',
        items: {
            ork_work_status_new: {
                name: 'Новый',
                code: 'ork_work_status_new'
            },
            ork_work_status_supply: {
                name: 'Поставка',
                code: 'ork_work_status_supply'
            },
            ork_work_status_first_edu: {
                name: 'Первичное обучение',
                code: 'ork_work_status_first_edu'
            },
            ork_work_status_edu: {
                name: 'Обучение',
                code: 'ork_work_status_edu'
            },
            ork_work_status_in_work: {
                name: 'В работе',
                code: 'ork_work_status_in_work'
            },
            ork_work_status_signal: {
                name: 'Отработка сигнала',
                code: 'ork_work_status_signal'
            },
            ork_work_status_pere_soon: {
                name: 'Скоро перезаключение',
                code: 'ork_work_status_pere_soon'
            },
            ork_work_status_pere: {
                name: 'Перезаключение',
                code: 'ork_work_status_pere'
            },
            ork_work_status_complect_up: {
                name: 'Увеличение комплекта',
                code: 'ork_work_status_complect_up'
            },
            ork_work_status_complect_down: {
                name: 'Уменьшение комплекта',
                code: 'ork_work_status_complect_down'
            },
            ork_work_status_threat: {
                name: 'Угроза отказа',
                code: 'ork_work_status_threat'
            },
            ork_work_status_fail_in_process: {
                name: 'В процессе отказа',
                code: 'ork_work_status_fail_in_process'
            },
            ork_work_status_fail: {
                name: 'Отказ',
                code: 'ork_work_status_fail'
            }
        }
    },
    ork_forecast: {
        name: 'ОРК Прогноз',
        code: 'ork_forecast',
        items: {
            ork_forecast_client: {
                name: 'Продолжение сотрудничества',
                code: 'ork_forecast_client'
            },
            ork_forecast_complect_up: {
                name: 'Увеличение комплекта',
                code: 'ork_forecast_complect_up'
            },
            ork_forecast_complect_down: {
                name: 'Уменьшение комплекта',
                code: 'ork_forecast_complect_down'
            },
            ork_forecast_maybefail: {
                name: 'Угроза отказа',
                code: 'ork_forecast_maybefail'
            },
            ork_forecast_fail: {
                name: 'Отказ',
                code: 'ork_forecast_fail'
            }
        }
    },
    ork_fail_reason: {
        name: 'ОРК Причина Отказа',
        code: 'ork_fail_reason',
        items: {
            ork_fr_lpr_changed: {
                name: 'Смена ЛПР',
                code: 'ork_fr_lpr_changed'
            },
            ork_fr_nomoney_plan: {
                name: 'Изменение бюджета',
                code: 'ork_fr_nomoney_plan'
            },
            ork_fr_concurent_money: {
                name: 'Конкуренты - оплачено',
                code: 'ork_fr_concurent_money'
            },
            ork_fr_lpr_concurent_money: {
                name: 'Конкуренты - цена',
                code: 'ork_fr_lpr_concurent_money'
            },
            ork_fr_nomoney: {
                name: 'Нет денег',
                code: 'ork_fr_nomoney'
            },
            ork_fr_lpr_noneeds: {
                name: 'Не видят надобности',
                code: 'ork_fr_lpr_noneeds'
            },
            ork_fr_lpr: {
                name: 'ЛПР против',
                code: 'ork_fr_lpr'
            },
            ork_fr_emploee_noneed: {
                name: 'Ключевой сотрудник против',
                code: 'ork_fr_emploee_noneed'
            },
            ork_fr_nocommunication: {
                name: 'Не хотят общаться',
                code: 'ork_fr_nocommunication'
            },
            ork_fr_company_changed: {
                name: 'Реорганизация',
                code: 'ork_fr_company_changed'
            },
            ork_fr_company_bankrot: {
                name: 'Компания не существует',
                code: 'ork_fr_company_bankrot'
            }
        }
    },
    ork_result_status: {
        name: 'Результативность',
        code: 'ork_result_status',
        items: {
            ork_call_result_yes: {
                name: 'Да',
                code: 'ork_call_result_yes'
            },
            ork_call_result_no: {
                name: 'Нет',
                code: 'ork_call_result_no'
            }
        }
    },
    ork_event_goal: {
        name: 'Цель коммуникации',
        code: 'ork_event_goal',
        items: {
            eg_ork_signal: {
                name: 'Отработка сигнала',
                code: 'eg_ork_signal'
            },
            eg_ork_edu: {
                name: 'Обучение',
                code: 'eg_ork_edu'
            },
            eg_ork_pres: {
                name: 'Презентация',
                code: 'eg_ork_pres'
            },
            eg_ork_soon: {
                name: 'Перезаключение',
                code: 'eg_ork_soon'
            },
            eg_ork_save: {
                name: 'Сохранение',
                code: 'eg_ork_save'
            },
            eg_ork_claim: {
                name: 'Отработка рекламации',
                code: 'eg_ork_claim'
            }
        }
    },
    ork_event_is_goal: {
        name: 'Цель достигнута',
        code: 'ork_event_is_goal',
        items: {
            ork_event_is_goal_yes: {
                name: 'Да',
                code: 'ork_event_is_goal_yes'
            },
            ork_event_is_goal_no: {
                name: 'Нет',
                code: 'ork_event_is_goal_no'
            }
        }
    },
    ork_noresult_reason: {
        name: 'Тип Нерезультативности',
        code: 'ork_noresult_reason',
        items: {
            secretar: {
                name: 'Секретарь',
                code: 'secretar'
            },
            nopickup: {
                name: 'Недозвон - трубку не берут',
                code: 'nopickup'
            },
            nonumber: {
                name: 'Недозвон - номер не существует',
                code: 'nonumber'
            },
            busy: {
                name: 'Занято',
                code: 'busy'
            },
            noresult_notime: {
                name: 'Перенос - не было времени',
                code: 'noresult_notime'
            },
            nocontact: {
                name: 'Контактера нет на месте',
                code: 'nocontact'
            },
            giveup: {
                name: 'Просят оставить свой номер',
                code: 'giveup'
            },
            bay: {
                name: 'Не интересует, до свидания',
                code: 'bay'
            },
            wrong: {
                name: 'По телефону отвечает не та организация',
                code: 'wrong'
            },
            auto: {
                name: 'Автоответчик',
                code: 'auto'
            }
        }
    },
    // Поля типа string
    event_title: {
        name: 'Название',
        code: 'event_title'
    },
    manager_comment: {
        name: 'Комментарий',
        code: 'manager_comment'
    },
    ork_evemt_tag: {
        name: 'Тэг',
        code: 'ork_evemt_tag'
    },
    // Поля типа datetime
    ork_event_date: {
        name: 'Дата',
        code: 'ork_event_date'
    },
    ork_plan_date: {
        name: 'Дата следующей коммуникации',
        code: 'ork_plan_date'
    },
    // Поля типа employee
    responsible: {
        name: 'Ответственный',
        code: 'responsible'
    },
    author: {
        name: 'Автор',
        code: 'author'
    },
    su: {
        name: 'Соисполнитель',
        code: 'su'
    },
    // Поля типа crm
    ork_crm_company: {
        name: 'Компания',
        code: 'ork_crm_company'
    },
    crm: {
        name: 'CRM',
        code: 'crm'
    },
    ork_crm_contact: {
        name: 'Контакт',
        code: 'ork_crm_contact'
    }
} as const;

type OrkFieldItem = {
    name: string;
    code: string;
};

type OrkField = {
    name: string;
    code: string;
    items?: Record<string, OrkFieldItem>;
};

export type OrkFieldCode = keyof typeof OrkFields;
export type OrkItemCode<T extends OrkFieldCode> = T extends keyof typeof OrkFields
    ? typeof OrkFields[T] extends { items: Record<string, OrkFieldItem> }
    ? keyof typeof OrkFields[T]['items']
    : never
    : never;

// Helper types for field metadata
export type OrkFieldType = 'string' | 'datetime' | 'enumeration' | 'employee' | 'crm';

export interface OrkFieldMetadata {
    name: string;
    appType: string;
    type: OrkFieldType;
    field_code: string;
}

export const OrkFieldsMetadata: Record<string, OrkFieldMetadata> = {
    event_title: {
        name: 'Название',
        appType: 'calling',
        type: 'string',
        field_code: 'event_title'
    },
    ork_crm_company: {
        name: 'Компания',
        appType: 'calling',
        type: 'crm',
        field_code: 'ork_crm_company'
    },
    ork_event_date: {
        name: 'Дата',
        appType: 'calling',
        type: 'datetime',
        field_code: 'ork_event_date'
    },
    ork_event_type: {
        name: 'Тип События',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_event_type'
    },
    ork_event_action: {
        name: 'Событие',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_event_action'
    },
    event_communication: {
        name: 'Тип коммуникации',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'event_communication'
    },
    ork_event_initiative: {
        name: 'Инициатива',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_event_initiative'
    },
    responsible: {
        name: 'Ответственный',
        appType: 'calling',
        type: 'employee',
        field_code: 'responsible'
    },
    ork_event_goal: {
        name: 'Цель коммуникации',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_event_goal'
    },
    ork_event_is_goal: {
        name: 'Цель достигнута',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_event_is_goal'
    },
    ork_plan_date: {
        name: 'Дата следующей коммуникации',
        appType: 'calling',
        type: 'datetime',
        field_code: 'ork_plan_date'
    },
    manager_comment: {
        name: 'Комментарий',
        appType: 'calling',
        type: 'string',
        field_code: 'manager_comment'
    },
    ork_result_status: {
        name: 'Результативность',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_result_status'
    },
    ork_noresult_reason: {
        name: 'Тип Нерезультативности',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_noresult_reason'
    },
    ork_work_status: {
        name: 'ОРК Статус работы в компании',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_work_status'
    },
    ork_forecast: {
        name: 'ОРК Прогноз',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_forecast'
    },
    ork_fail_reason: {
        name: 'ОРК Причина Отказа',
        appType: 'calling',
        type: 'enumeration',
        field_code: 'ork_fail_reason'
    },
    author: {
        name: 'Автор',
        appType: 'calling',
        type: 'employee',
        field_code: 'author'
    },
    su: {
        name: 'Соисполнитель',
        appType: 'calling',
        type: 'employee',
        field_code: 'su'
    },
    crm: {
        name: 'CRM',
        appType: 'calling',
        type: 'crm',
        field_code: 'crm'
    },
    ork_crm_contact: {
        name: 'Контакт',
        appType: 'calling',
        type: 'crm',
        field_code: 'ork_crm_contact'
    },
    ork_evemt_tag: {
        name: 'Тэг',
        appType: 'calling',
        type: 'string',
        field_code: 'ork_evemt_tag'
    }
} as const;