/**
 * Типизация смарт-процесса «Отчёт за месяц» (service_month) отдела сервиса.
 *
 * Поля смарта на портале резолвятся по коду через
 * `PortalModel.getSmartByType('service_month')` +
 * `PortalModel.getSmartFieldByCode(smart, code)`. Чтобы не плодить магические
 * строки, перечисляем все коды полей, которые использует поток отчёта
 * (legacy `get_smart_field_by_code`).
 */

/** Тип смарт-процесса «Отчёт за месяц» (значение `IPSmart.type`). */
export const PBX_SERVICE_MONTH_SMART_TYPE = 'service_month' as const;
export type PbxServiceMonthSmartType = typeof PBX_SERVICE_MONTH_SMART_TYPE;

/** Коды полей смарта service_month (как на портале, без магических строк). */
export enum PbxServiceMonthFieldCode {
    /** CRM-привязка (CO_/D_/C_) */
    crm = 'crm',
    /** Компания */
    crm_company = 'crm_company',
    /** Контакт */
    crm_contact = 'crm_contact',
    /** Тип клиента */
    type_client = 'type_client',
    /** Должность контакта */
    position = 'position',
    /** Телефон */
    phone = 'phone',
    /** Email */
    email = 'email',
    /** Ответственный */
    responsible = 'responsible',
    /** Количество первичных обучений */
    count_first_edu = 'count_first_edu',
    /** Кто проводил первичное обучение */
    responsible_first_edu = 'responsible_first_edu',
    /** Количество обучений */
    count_edu = 'count_edu',
    /** Кто проводил обучение */
    responsible_edu = 'responsible_edu',
    /** Дата последнего обучения */
    date_last_edu = 'date_last_edu',
    /** Дата следующего обучения */
    date_next_edu = 'date_next_edu',
    /** Количество презентаций */
    count_presentation = 'count_presentation',
    /** Кто провёл последнюю презентацию */
    responsible_presentation = 'responsible_presentation',
    /** Общее количество результативных коммуникаций */
    count_communication_fact = 'count_communication_fact',
    /** Количество входящих результативных коммуникаций */
    count_communication_incoming = 'count_communication_incoming',
    /** Количество исходящих результативных коммуникаций */
    count_communication_outgoing = 'count_communication_outgoing',
    /** Количество сервисных сигналов */
    count_signal = 'count_signal',
    /** Количество отработанных сервисных сигналов */
    count_success_signal = 'count_success_signal',
    /** Тип коммуникации: Звонок */
    count_call = 'count_call',
    /** Дата последнего звонка */
    date_last_call = 'date_last_call',
    /** Дата следующего звонка */
    date_next_call = 'date_next_call',
    /** Тип коммуникации: Выезд */
    count_face = 'count_face',
    /** Плановое количество коммуникаций */
    count_communication_plan = 'count_communication_plan',
    /** Степень удовлетворённости потребностей */
    degree_need = 'degree_need',
    /** Конкурент */
    concurent = 'concurent',
    /** Дата поставки */
    supply_date = 'supply_date',
    /** Начало договора */
    contract_start = 'contract_start',
    /** Окончание договора */
    contract_end = 'contract_end',
    /** Название комплекта */
    complect_name = 'complect_name',
}
