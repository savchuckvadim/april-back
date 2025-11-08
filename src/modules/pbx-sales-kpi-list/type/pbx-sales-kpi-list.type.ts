// нфо	appType	type field_code
// Название	calling	string	event_title
// Компания	calling	crm	ork_crm_company
// Дата	calling	datetime	ork_event_date

import { EnumSalesKpiEventAction, EnumSalesKpiEventType, EnumSalesKpiFieldCode, EnumSalesKpiOpFailReason, EnumSalesKpiOpNoresultReason, EnumSalesKpiOpResultStatus, EnumSalesKpiOpWorkStatus, } from "./pbx-sales-kpi-list.enum";

// crm_company
// event_date
// event_type
// event_action
// event_title
// responsible
// plan_date
// manager_comment
// op_result_status
// op_noresult_reason
// op_work_status
// op_prospects_type
// op_fail_reason
// author
// su
// crm

export const SalesKpiFields = {
    [EnumSalesKpiFieldCode.event_type]: {
        name: 'Тип События',
        code: EnumSalesKpiFieldCode.event_type,
        items: {
            xo: {
                name: 'Холодный звонок',
                code: EnumSalesKpiEventType.xo,
            },
            info: {
                name: 'Информация',
                code: EnumSalesKpiEventType.info,
            },
            call: {
                name: 'Звонок по документам',
                code: EnumSalesKpiEventType.call,
            },
            call_in_money: {
                name: 'Звонок по оплате',
                code: EnumSalesKpiEventType.call_in_money,
            },
            come_call: {
                name: 'Звонок по заказу',
                code: EnumSalesKpiEventType.come_call,
            },
            site: {
                name: 'Заявка с сайта',
                code: EnumSalesKpiEventType.site,
            },
            presentation: {
                name: 'Презентация',
                code: EnumSalesKpiEventType.presentation,
            },
            presentation_uniq: {
                name: 'Презентация(уникальная)',
                code: EnumSalesKpiEventType.presentation_uniq,
            },
            seminar: {
                name: 'Обучение первичное',
                code: EnumSalesKpiEventType.seminar,
            },
            ev_contract: {
                name: 'Договор',
                code: EnumSalesKpiEventType.ev_contract,
            },
            ev_offer: {
                name: 'Предложение',
                code: EnumSalesKpiEventType.ev_offer,
            },
            ev_invoice: {
                name: 'Счет',
                code: EnumSalesKpiEventType.ev_invoice,
            },
            ev_offer_pres: {
                name: 'Предложение(презентация)',
                code: EnumSalesKpiEventType.ev_offer_pres,
            },
            ev_invoice_pres: {
                name: 'Счет(презентация)',
                code: EnumSalesKpiEventType.ev_invoice_pres,
            },
            ev_supply: {
                name: 'Поставка',
                code: EnumSalesKpiEventType.ev_supply,
            },
            ev_success: {
                name: 'Успех',
                code: EnumSalesKpiEventType.ev_success,
            },
            ev_fail: {
                name: 'Отказ',
                code: EnumSalesKpiEventType.ev_fail,
            },
        },
    },
    [EnumSalesKpiFieldCode.event_action]: {
        name: 'Событие',
        code: EnumSalesKpiFieldCode.event_action,
        items: {
            [EnumSalesKpiEventAction.plan]: {
                name: 'Запланирован',
                code: EnumSalesKpiEventAction.plan,
            },
            [EnumSalesKpiEventAction.done]: {
                name: 'Состоялся',
                code: EnumSalesKpiEventAction.done,
            },
            [EnumSalesKpiEventAction.expired]: {
                name: 'Просрочен',
                code: EnumSalesKpiEventAction.expired,
            },
            [EnumSalesKpiEventAction.pound]: {
                name: 'Перенос',
                code: EnumSalesKpiEventAction.pound,
            },
            [EnumSalesKpiEventAction.act_noresult_fail]: {
                name: 'Не состоялся',
                code: EnumSalesKpiEventAction.act_noresult_fail,
            },
            [EnumSalesKpiEventAction.act_init_send]: {
                name: 'Заявка отправлена',
                code: EnumSalesKpiEventAction.act_init_send,
            },
            [EnumSalesKpiEventAction.act_init_done]: {
                name: 'Заявка принята',
                code: EnumSalesKpiEventAction.act_init_done,
            },
            [EnumSalesKpiEventAction.act_send]: {
                name: 'Отправлен',
                code: EnumSalesKpiEventAction.act_send,
            },
            [EnumSalesKpiEventAction.act_sign]: {
                name: 'Подписан',
                code: EnumSalesKpiEventAction.act_sign,
            },
            [EnumSalesKpiEventAction.act_pay]: {
                name: 'Оплачен',
                code: EnumSalesKpiEventAction.act_pay,
            },
        },
    },
    [EnumSalesKpiFieldCode.author]: {
        name: 'Автор',
        code: EnumSalesKpiFieldCode.author,
    },
    [EnumSalesKpiFieldCode.responsible]: {
        name: 'Ответственный',
        code: EnumSalesKpiFieldCode.responsible,
    },
    [EnumSalesKpiFieldCode.su]: {
        name: 'Соисполнитель',
        code: EnumSalesKpiFieldCode.su,
    },
    [EnumSalesKpiFieldCode.crm]: {
        name: 'CRM',
        code: EnumSalesKpiFieldCode.crm,
    },
    [EnumSalesKpiFieldCode.manager_comment]: {
        name: 'Комментарий',
        code: EnumSalesKpiFieldCode.manager_comment,
    },
    [EnumSalesKpiFieldCode.op_result_status]: {
        name: 'Результативность',
        code: EnumSalesKpiFieldCode.op_result_status,
        items: {
            [EnumSalesKpiOpResultStatus.op_call_result_yes]: {
                name: 'Да',
                code: EnumSalesKpiOpResultStatus.op_call_result_yes,
            },
            [EnumSalesKpiOpResultStatus.op_call_result_no]: {
                name: 'Нет',
                code: EnumSalesKpiOpResultStatus.op_call_result_no,
            },
        },
    },
    [EnumSalesKpiFieldCode.op_noresult_reason]: {
        name: 'Тип Нерезультативности',
        code: EnumSalesKpiFieldCode.op_noresult_reason,
        items: {
            [EnumSalesKpiOpNoresultReason.secretar]: {
                name: 'Секретарь',
                code: EnumSalesKpiOpNoresultReason.secretar,
            },
        },
        [EnumSalesKpiOpNoresultReason.nopickup]: {
            name: 'Не взяли трубку',
            code: EnumSalesKpiOpNoresultReason.nopickup,
        },
        [EnumSalesKpiOpNoresultReason.nonumber]: {
            name: 'Не номер',
            code: EnumSalesKpiOpNoresultReason.nonumber,
        },
        [EnumSalesKpiOpNoresultReason.busy]: {
            name: 'Занято',
            code: EnumSalesKpiOpNoresultReason.busy,
        },
        [EnumSalesKpiOpNoresultReason.noresult_notime]: {
            name: 'Перенос - не было времени',
            code: EnumSalesKpiOpNoresultReason.noresult_notime,
        },
        [EnumSalesKpiOpNoresultReason.nocontact]: {
            name: 'Контактера нет на месте',
            code: EnumSalesKpiOpNoresultReason.nocontact,
        },
        [EnumSalesKpiOpNoresultReason.giveup]: {
            name: 'Просят оставить свой номер',
            code: EnumSalesKpiOpNoresultReason.giveup,
        },
        [EnumSalesKpiOpNoresultReason.bay]: {
            name: 'Не интересует, до свидания',
            code: EnumSalesKpiOpNoresultReason.bay,
        },
        [EnumSalesKpiOpNoresultReason.wrong]: {
            name: 'По телефону отвечает не та организация',
            code: EnumSalesKpiOpNoresultReason.wrong,
        },
        [EnumSalesKpiOpNoresultReason.auto]: {
            name: 'Автоответчик',
            code: EnumSalesKpiOpNoresultReason.auto,
        },
    },
    [EnumSalesKpiFieldCode.op_work_status]: {
        name: 'Статус работы в компании',
        code: EnumSalesKpiFieldCode.op_work_status,
        items: {
            [EnumSalesKpiOpWorkStatus.op_status_in_work]: {
                name: 'В работе',
                code: EnumSalesKpiOpWorkStatus.op_status_in_work,
            },
            [EnumSalesKpiOpWorkStatus.op_status_in_long]: {
                name: 'В долгосрочной работе',
                code: EnumSalesKpiOpWorkStatus.op_status_in_long,
            },
            [EnumSalesKpiOpWorkStatus.op_status_success]: {
                name: 'Успех',
                code: EnumSalesKpiOpWorkStatus.op_status_success,
            },
            [EnumSalesKpiOpWorkStatus.op_status_in_progress]: {
                name: 'В работе',
                code: EnumSalesKpiOpWorkStatus.op_status_in_progress,
            },
            [EnumSalesKpiOpWorkStatus.op_status_money_await]: {
                name: 'Ожидание оплаты',
                code: EnumSalesKpiOpWorkStatus.op_status_money_await,
            },
            [EnumSalesKpiOpWorkStatus.op_status_fail]: {
                name: 'Отказ',
                code: EnumSalesKpiOpWorkStatus.op_status_fail,
            },
        },
    },
    [EnumSalesKpiFieldCode.op_fail_reason]: {
        name: 'ОРК Причина Отказа',
        code: EnumSalesKpiFieldCode.op_fail_reason,
        items: {
            [EnumSalesKpiOpFailReason.fail_notime]: {
                name: 'Не хватает времени',
                code: EnumSalesKpiOpFailReason.fail_notime,
            },
            [EnumSalesKpiOpFailReason.c_habit]: {
                name: 'Конкуренты - привыкли',
                code: EnumSalesKpiOpFailReason.c_habit,
            },
            [EnumSalesKpiOpFailReason.c_prepay]: {
                name: 'Конкуренты - оплачено',
                code: EnumSalesKpiOpFailReason.c_prepay,
            },
            [EnumSalesKpiOpFailReason.c_price]: {
                name: 'Конкуренты - цена',
                code: EnumSalesKpiOpFailReason.c_price,
            },
            [EnumSalesKpiOpFailReason.to_expensive]: {
                name: 'Дорого/нет Денег',
                code: EnumSalesKpiOpFailReason.to_expensive,
            },
            [EnumSalesKpiOpFailReason.to_cheap]: {
                name: 'Слишком дешево',
                code: EnumSalesKpiOpFailReason.to_cheap,
            },
            [EnumSalesKpiOpFailReason.nomoney]: {
                name: 'Нет денег',
                code: EnumSalesKpiOpFailReason.nomoney,
            },
            [EnumSalesKpiOpFailReason.noneed]: {
                name: 'Не видят надобности',
                code: EnumSalesKpiOpFailReason.noneed,
            },
            [EnumSalesKpiOpFailReason.lpr]: {
                name: 'ЛПР против',
                code: EnumSalesKpiOpFailReason.lpr,
            },
            [EnumSalesKpiOpFailReason.employee]: {
                name: 'Ключевой сотрудник против',
                code: EnumSalesKpiOpFailReason.employee,
            },
            [EnumSalesKpiOpFailReason.fail_off]: {
                name: 'Не хотят общаться',
                code: EnumSalesKpiOpFailReason.fail_off,
            }
        },
    },

} as const;
export type SalesKpiFieldsType = typeof SalesKpiFields;
export type SalesKpiFieldsCode = keyof SalesKpiFieldsType;
export type SalesKpiFieldValue<K extends keyof SalesKpiFieldsType> =
    SalesKpiFieldsType[K] extends { items: Record<string, { code: infer C }> }
    ? C
    : string;
type SalesKpiFieldItem = {
    name: string;
    code: string;
};

type SalesKpiField = {
    name: string;
    code: string;
    items?: Record<string, SalesKpiFieldItem>;
};

export type SalesKpiFieldCode = keyof typeof SalesKpiFields;
export type SalesKpiItemCode<T extends SalesKpiFieldCode> =
    T extends keyof typeof SalesKpiFields
    ? (typeof SalesKpiFields)[T] extends { items: Record<string, SalesKpiFieldItem> }
    ? keyof (typeof SalesKpiFields)[T]['items']
    : never
    : never;

// Helper types for field metadata
export type FieldType =
    | 'string'
    | 'datetime'
    | 'enumeration'
    | 'employee'
    | 'crm';

export interface SalesKpiFieldMetadata {
    name: string;
    appType: string;
    type: FieldType;
    field_code: string;
}

export const SalesKpiFieldsMetadata: Record<string, SalesKpiFieldMetadata> = {
    [EnumSalesKpiFieldCode.event_title]: {
        name: 'Название',
        appType: 'calling',
        type: 'string',
        field_code: EnumSalesKpiFieldCode.event_title,
    },
    [EnumSalesKpiFieldCode.crm_company]: {
        name: 'Компания',
        appType: 'calling',
        type: 'crm',
        field_code: EnumSalesKpiFieldCode.crm_company,
    },
    [EnumSalesKpiFieldCode.event_date]: {
        name: 'Дата',
        appType: 'calling',
        type: 'datetime',
        field_code: EnumSalesKpiFieldCode.event_date,
    },
    [EnumSalesKpiFieldCode.event_type]: {
        name: 'Тип События',
        appType: 'calling',
        type: 'enumeration',
        field_code: EnumSalesKpiFieldCode.event_type,
    },
    [EnumSalesKpiFieldCode.event_action]: {
        name: 'Событие',
        appType: 'calling',
        type: 'enumeration',
        field_code: EnumSalesKpiFieldCode.event_action,
    },

    [EnumSalesKpiFieldCode.responsible]: {
        name: 'Ответственный',
        appType: 'calling',
        type: 'employee',
        field_code: EnumSalesKpiFieldCode.responsible,
    },
    [EnumSalesKpiFieldCode.plan_date]: {
        name: 'Дата следующей коммуникации',
        appType: 'calling',
        type: 'datetime',
        field_code: EnumSalesKpiFieldCode.plan_date,
    },
    [EnumSalesKpiFieldCode.manager_comment]: {
        name: 'Комментарий',
        appType: 'calling',
        type: 'string',
        field_code: EnumSalesKpiFieldCode.manager_comment,
    },
    [EnumSalesKpiFieldCode.op_result_status]: {
        name: 'Результативность',
        appType: 'calling',
        type: 'enumeration',
        field_code: EnumSalesKpiFieldCode.op_result_status,
    },
    [EnumSalesKpiFieldCode.op_noresult_reason]: {
        name: 'Тип Нерезультативности',
        appType: 'calling',
        type: 'enumeration',
        field_code: EnumSalesKpiFieldCode.op_noresult_reason,
    },
    [EnumSalesKpiFieldCode.op_work_status]: {
        name: 'Статус работы в компании',
        appType: 'calling',
        type: 'enumeration',
        field_code: EnumSalesKpiFieldCode.op_work_status,
    },
    [EnumSalesKpiFieldCode.op_fail_reason]: {
        name: 'Причина Отказа',
        appType: 'calling',
        type: 'enumeration',
        field_code: EnumSalesKpiFieldCode.op_fail_reason,
    },

} as const;


export const SalesKpiReport = {
    [EnumSalesKpiEventAction.plan]: {
        types: [
            EnumSalesKpiEventType.xo,
            EnumSalesKpiEventType.info,
            EnumSalesKpiEventType.call,
            EnumSalesKpiEventType.call_in_money,
            EnumSalesKpiEventType.come_call,
            EnumSalesKpiEventType.site,
            EnumSalesKpiEventType.presentation,
            EnumSalesKpiEventType.presentation_uniq,
            EnumSalesKpiEventType.presentation_contact_uniq,
            EnumSalesKpiEventType.seminar,
        ]
    },
    [EnumSalesKpiEventAction.done]: {
        types: [
            EnumSalesKpiEventType.xo,
            EnumSalesKpiEventType.info,
            EnumSalesKpiEventType.call,
            EnumSalesKpiEventType.call_in_money,
            EnumSalesKpiEventType.come_call,
            EnumSalesKpiEventType.site,
            EnumSalesKpiEventType.presentation,
            EnumSalesKpiEventType.presentation_uniq,
            EnumSalesKpiEventType.presentation_contact_uniq,
            EnumSalesKpiEventType.seminar,
        ]
    }
} as const;


export const SalesKpiCallingTypes = [
    EnumSalesKpiEventType.xo,
    EnumSalesKpiEventType.info,
    EnumSalesKpiEventType.call,
    EnumSalesKpiEventType.call_in_money,
    EnumSalesKpiEventType.come_call,
    EnumSalesKpiEventType.site,
    EnumSalesKpiEventType.presentation,
    EnumSalesKpiEventType.presentation_uniq,
    EnumSalesKpiEventType.seminar,
]

