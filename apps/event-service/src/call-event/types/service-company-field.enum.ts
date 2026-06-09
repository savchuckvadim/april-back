/**
 * Коды портальных полей компании отдела сервиса, обновляемых после звонка
 * (резолвятся через `PortalModel.getCompanyFieldByCode(code)`). Убирают
 * магические строки из company-deal-update сервиса.
 */
export enum ServiceCompanyFieldCode {
    /** ОРК Комментарий История (multiple) */
    ork_last_history = 'ork_last_history',
    /** ОРК Тема следующего звонка */
    ork_next_call_name = 'ork_next_call_name',
    /** ОРК Дата следующего звонка */
    ork_next_call_date = 'ork_next_call_date',
    /** ОРК Тема последнего звонка */
    ork_last_call_name = 'ork_last_call_name',
    /** ОРК Дата последнего звонка */
    ork_last_call_date = 'ork_last_call_date',
    /** Фактическое количество исходящих коммуникаций */
    ork_communication_fact_count = 'ork_communication_fact_count',
    /** Количество презентаций */
    ork_pres_count = 'ork_pres_count',
    /** Тема последней презентации */
    ork_last_pres_name = 'ork_last_pres_name',
    /** Дата последней презентации */
    ork_last_pres_date = 'ork_last_pres_date',
    /** Тема следующей презентации */
    ork_next_pres_name = 'ork_next_pres_name',
    /** Дата следующей презентации */
    ork_next_pres_date = 'ork_next_pres_date',
    /** Количество обучений */
    ork_edu_count = 'ork_edu_count',
    /** Тема последнего обучения */
    ork_last_edu_name = 'ork_last_edu_name',
    /** Дата последнего обучения */
    ork_last_edu_date = 'ork_last_edu_date',
    /** Тема следующего обучения */
    ork_next_edu_name = 'ork_next_edu_name',
    /** Дата следующего обучения */
    ork_next_edu_date = 'ork_next_edu_date',
}
