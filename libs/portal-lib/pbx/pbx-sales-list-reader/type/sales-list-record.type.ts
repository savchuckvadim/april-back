/**
 * Типы «робота»-читателя списков отчётности ОП (sales_kpi / sales_history):
 * запись списка с РЕЗОЛВЛЕННЫМИ полями — коды, человеческие названия,
 * значения выпадающих списков по справочникам слепка портала, даты.
 */

/** Код списка отчётности ОП в слепке портала. */
export type SalesListCode = 'sales_kpi' | 'sales_history';

/** Запрос записей: все условия опциональны и комбинируются через И. */
export interface SalesListQuery {
    /**
     * CRM-ссылки в формате crm-поля списка: D_{id} сделка, L_{id} лид,
     * CO_{id} компания, C_{id} контакт (поле множественное — совпадение
     * по любой ссылке).
     */
    crmRefs?: string[];
    /**
     * Коды типов события (items поля event_type: presentation, xo, call…) —
     * фильтр по значению выпадающего списка через bitrixId элемента.
     */
    eventTypeCodes?: string[];
    /** Коды действия события (items поля event_action: plan, done…). */
    eventActionCodes?: string[];
    /** Окно по ДАТЕ СОБЫТИЯ (поле event_date; нет поля — DATE_CREATE). */
    dateFrom?: Date;
    dateTo?: Date;
    /** Ответственный (поле responsible; нет поля — CREATED_BY). */
    responsibleId?: string | number;
    /** Максимум записей (по умолчанию 20). */
    limit?: number;
}

/** Одно заполненное поле записи в человекочитаемом виде. */
export interface SalesListRecordField {
    /** Короткий код поля без префикса списка (event_type, manager_comment…). */
    code: string;
    /** Человеческое название поля. */
    name: string;
    /** Резолвленное значение: имя элемента списка / дата / текст. */
    value: string;
}

/** Запись списка отчётности с резолвленными полями. */
export interface SalesListRecord {
    id: string;
    listCode: SalesListCode;
    /** NAME записи (заголовок события). */
    name: string;
    /** Дата создания записи (DATE_CREATE). */
    createdAt: string | null;
    /** Дата события (поле event_date) — важнее даты создания. */
    eventDate: string | null;
    /** Тип события: код item'а и человеческое название. */
    eventTypeCode: string | null;
    eventTypeName: string | null;
    /** Действие события (план/проведено/…). */
    eventActionCode: string | null;
    eventActionName: string | null;
    /** Ответственный (id пользователя из поля responsible). */
    responsibleId: string | null;
    /** CRM-ссылки записи (D_/L_/CO_/C_). */
    crmRefs: string[];
    /**
     * Остальные заполненные поля (комментарии менеджера, статусы,
     * перспективность…) — без служебных (crm/даты/тип/действие).
     */
    fields: SalesListRecordField[];
}

/** Служебные короткие коды — не включаются в fields записи. */
export const SALES_LIST_TECHNICAL_FIELD_CODES = [
    'crm',
    'crm_company',
    'crm_contact',
    'event_date',
    'event_type',
    'event_action',
    'event_title',
    'plan_date',
    'responsible',
    'author',
    'su',
] as const;

/**
 * Строка записи для LLM-промпта: id, дата события, тип/действие и
 * содержательные поля (комментарии менеджера). Единый формат для
 * ревизора-привязки и сверки по презентациям.
 */
export function renderSalesListRecordLine(record: SalesListRecord): string {
    const meta = [
        record.eventDate ? `дата события ${record.eventDate}` : null,
        record.eventTypeName ? `тип: ${record.eventTypeName}` : null,
        record.eventActionName ? `действие: ${record.eventActionName}` : null,
    ]
        .filter(Boolean)
        .join(', ');
    const fields = record.fields
        .map(field => `${field.name}: ${field.value}`)
        .join('; ');
    return (
        `id=${record.id} [${meta || `создана ${record.createdAt ?? '—'}`}] ${record.name}` +
        (fields ? `\n  ${fields}` : '')
    );
}
