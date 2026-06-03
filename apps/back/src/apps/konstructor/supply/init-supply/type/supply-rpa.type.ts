export const SupplyRpaFields = {
    sale_date: {
        code: 'sale_date',
        name: 'Дата продажи',
        type: 'datetime',
        required: true,
    },
    client_call_date: {
        code: 'client_call_date',
        name: 'Клиент ждет звонка от менеджера ОРК',
        type: 'datetime',
        required: true,
    },
    supply_date: {
        code: 'supply_date',
        name: 'Дата поставки',
        type: 'datetime',
        required: true,
    },
    first_pay_date: {
        code: 'first_pay_date',
        name: 'Дата первого платежа',
        type: 'date',
        required: true,
    },
    contract_start: {
        code: 'contract_start',
        name: 'Дата начала договора',
        type: 'datetime',
        required: true,
    },
    contract_end: {
        code: 'contract_end',
        name: 'Дата окончания договора',
        type: 'datetime',
        required: true,
    },
    rpa_crm_company: {
        code: 'rpa_crm_company',
        name: 'Компания в CRM',
        type: 'crm',
        required: true,
    },
    rpa_crm_contacts: {
        code: 'rpa_crm_contacts',
        name: 'Контакты в CRM',
        type: 'crm',
        required: true,
    },
    company_rq_inn: {
        code: 'company_rq_inn',
        name: 'ИНН',
        type: 'string',
        required: true,
    },
    service_address: {
        code: 'service_address',
        name: 'Фактический адрес',
        type: 'string',
        required: true,
    },
    service_email_complect: {
        code: 'service_email_complect',
        name: 'Email комплекта',
        type: 'string',
        required: true,
    },
    rpa_crm_base_deal: {
        code: 'rpa_crm_base_deal',
        name: 'Основная сделка',
        type: 'crm',
        required: true,
    },

    manager_op: {
        code: 'manager_op',
        name: 'Менеджер ОП',
        type: 'employee',
        required: true,
    },
    situation_comments: {
        code: 'situation_comments',
        name: 'Описание ситуации, примечания и дополнительные сведения',
        type: 'string',
        required: true,
    },

    in_ork: {
        code: 'in_ork',
        name: 'В орке',
        type: 'enumeration',
        required: true,
    },

    in_arm: {
        code: 'in_arm',
        name: 'В арм',
        type: 'enumeration',
        required: true,
    },
    invoice_pay_type: {
        code: 'invoice_pay_type',
        name: 'Тип оплаты',
        type: 'enumeration',
        required: true,
    },

    current_supply: {
        code: 'current_supply',
        name: 'Текущий Отчет о поставке',
        type: 'file',
        required: true,
    },

    is_invoice_done: {
        code: 'is_invoice_done',
        name: 'Создавался ли счет',
        type: 'boolean',
        required: true,
    },
    invoice_number: {
        code: 'invoice_number',
        name: 'Номер счета',
        type: 'string',
        required: true,
    },
    current_invoice: {
        code: 'current_invoice',
        name: 'Текущий счет',
        type: 'file',
        required: true,
    },
    invoice_result: {
        code: 'invoice_result',
        name: 'Судьба счета',
        type: 'enumeration',
        required: true,
    },

    contract_type: {
        code: 'contract_type',
        name: 'Тип договора',
        type: 'string',
        required: true,
    },
    is_contract_done: {
        code: 'is_contract_done',
        name: 'Договор заключен',
        type: 'boolean',
        required: true,
    },
    contract_number: {
        code: 'contract_number',
        name: 'Номер договора',
        type: 'text',
        required: true,
    },

    current_contract: {
        code: 'current_contract',
        name: 'Текущий договор',
        type: 'file',
        required: true,
    },

    contract_result: {
        code: 'contract_result',
        name: 'Судьба договора',
        type: 'enumeration',
        required: true,
    },

    op_client_type: {
        code: 'op_client_type',
        name: 'Тип клиента',
        type: 'enumeration',
        required: true,
    },
    op_category: {
        code: 'op_category',
        name: 'Категория',
        type: 'enumeration',
        required: true,
    },
    op_client_status: {
        code: 'op_client_status',
        name: 'Статус клиента',
        type: 'enumeration',
        required: true,
    },
    op_concurents: {
        code: 'op_concurents',
        name: 'Конкуренты',
        type: 'enumeration',
        required: true,
    },
    supply_information: {
        code: 'supply_information',
        name: 'Что известно о конкурентах',
        type: 'enumeration',
        required: true,
    },

    rpa_arm_client_id: {
        code: 'rpa_arm_client_id',
        name: 'ID клиента в арм',
        type: 'string',
        required: true,
    },
    rpa_arm_complect_id: {
        code: 'rpa_arm_complect_id',
        name: 'ID комплекта в арм',
        type: 'multiple',
        required: true,
    },

    // rpa_tmc_comment: {
    //     code: 'rpa_tmc_comment',
    //     name: 'Комментарий ТМЦ',
    //     type: 'text',
    //     required: true,

    // },
    // rpa_manager_comment: {
    //     code: 'rpa_manager_comment',
    //     name: 'Комментарий менеджера',
    //     type: 'text',
    //     required: true,

    // },
    // rpa_edu_comment: {
    //     code: 'rpa_edu_comment',
    //     name: 'Комментарий менеджера',
    //     type: 'text',
    //     required: true,

    // },

    // rpa_need_technic_date: {
    //     code: 'rpa_need_technic_date',
    //     name: 'Дата звонка клиента',
    //     type: 'date',
    //     required: true,

    // },

    // rpa_supply_lids: {
    //     code: 'rpa_supply_lids',
    //     name: 'LIDы поставки',
    //     type: 'array',
    //     required: true,

    // },

    // ork_arm_date: {
    //     code: 'ork_arm_date',
    //     name: 'Дата арм',
    //     type: 'date',
    //     required: true,

    // },

    // base_garant_user: {
    //     code: 'base_garant_user',
    //     name: 'Основной пользователь',
    //     type: 'crm',
    //     required: true,

    // },
    // garant_assigned: {
    //     code: 'garant_assigned',
    //     name: 'Ответственный за получение справочника',
    //     type: 'crm',
    //     required: true,

    // },
};
