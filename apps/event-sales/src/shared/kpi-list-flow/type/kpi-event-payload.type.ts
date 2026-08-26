import { PbxSalesKpiListFieldItemCode } from '@lib/portal-lib/pbx/pbx-sales-kpi-list/type/pbx-sales-kpi-list-field.type';
import { PbxSalesEventFieldItemCode } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Payload одного KPI-/History-элемента в логических кодах
 * (без привязки к bitrixId конкретного портала).
 *
 * Модель `KpiEventItemModel` сама подставит правильные `PROPERTY_*` / item-id
 * по {@link IPBXList}.
 */
export interface KpiEventPayload {
    /** Значение поля NAME элемента списка */
    name: string;

    /** Скалярные значения полей (даты, employee-id, crm, комментарий и т.п.) */
    values: KpiEventScalarValues;

    /** Поля-перечисления, передаются как короткие коды item */
    items: KpiEventItemCodes;

    /**
     * Переопределение item'ов ТОЛЬКО для списка истории (sales_history):
     * мержится поверх `items` при записи в history. Нужно типам, которые в
     * сводке KPI считаются общим кодом (refine → call), а в ленте истории
     * должны быть видны своим item'ом (refine). Неустановленный на портале
     * item отработает штатной мягкой деградацией (warning + пропуск поля).
     */
    historyItems?: Partial<KpiEventItemCodes>;

    /**
     * Дедупликация элемента (финальные и уникальные записи). Отсутствует —
     * обычное множественное событие: код с временным суффиксом, всегда add.
     */
    dedup?: KpiEventDedup;
}

/**
 * Правило дедупликации записи по ДЕТЕРМИНИРОВАННОМУ коду элемента:
 * `${list.type}_${key}`. Код неизменяем после создания — по его наличию
 * решается, писать ли снова.
 */
export interface KpiEventDedup {
    /**
     * Детерминированная часть кода (без префикса типа списка), например
     * `final_deal_1024` или `uniq_presentation_co_7`.
     */
    key: string;
    /** Куда пишется: оба списка (финал) либо только sales_kpi (уникальные). */
    scope: 'both' | 'kpi';
    /**
     * `upsert` — существующий элемент обновляется (crm-привязки, даты,
     * причина): одна продажа/один отказ на владельца.
     * `insert-once` — существующий НЕ трогается: уникальное событие
     * фиксируется один раз и сохраняет исходную дату.
     */
    mode: 'upsert' | 'insert-once';
    /**
     * Запись не имеет смысла без item'а `event_type` (уникальные события):
     * если item ещё не установлен на портале — пропустить элемент целиком
     * с warning, а не создать «безтиповый» мусор.
     */
    requireEventTypeItem?: boolean;
}

export interface KpiEventScalarValues {
    /** sales_kpi_event_date — дата события (момент записи) */
    event_date?: string;

    /** sales_kpi_event_title — заголовок события */
    event_title?: string;

    /** sales_kpi_plan_date — дата следующей коммуникации */
    plan_date?: string | null;

    /** sales_kpi_author */
    author?: string | number;

    /** sales_kpi_responsible */
    responsible?: string | number;

    /** sales_kpi_su — соисполнитель */
    su?: string | number;

    /** sales_kpi_crm — мапа `{ n0: 'CO_1', n1: 'D_2', ... }` */
    crm?: Record<string, string>;

    /** sales_kpi_crm_company */
    crm_company?: Record<string, string>;

    /** sales_kpi_crm_contact */
    crm_contact?: Record<string, string>;

    /** sales_kpi_manager_comment */
    manager_comment?: string;
}

/**
 * Item codes для enumeration-полей KPI/History элемента.
 *
 * Все типы выведены из `PBX_SALES_KPI_LIST_FIELDS` / `PBX_SALES_EVENT_FIELDS`
 * — никаких magic-строк. TS отловит опечатку на этапе компиляции.
 *
 * NB: `op_prospects_type` живёт в event-fields (не в kpi-list-fields), потому
 * что это одно и то же портальное enumeration, переиспользуемое в нескольких
 * сущностях; берём литералы оттуда.
 */
export interface KpiEventItemCodes {
    /** event_type: 'xo' | 'call' | 'presentation' | 'info' | ... */
    event_type?: PbxSalesKpiListFieldItemCode<'event_type'>;

    /** event_action: 'plan' | 'done' | 'expired' | 'pound' */
    event_action?: PbxSalesKpiListFieldItemCode<'event_action'>;

    /** op_result_status: 'op_call_result_yes' | 'op_call_result_no' */
    op_result_status?: PbxSalesKpiListFieldItemCode<'op_result_status'>;

    /**
     * op_noresult_reason: 'secretar' | 'nopickup' | 'busy' | ...
     *
     * `null` — явная очистка поля (пустое значение в FIELDS): финал
     * upsert'ится, и без очистки стейл-«недозвон» от прошлых событий жил бы
     * в записи вечно. `undefined` — поле не трогается.
     */
    op_noresult_reason?: PbxSalesKpiListFieldItemCode<'op_noresult_reason'> | null;

    /** op_work_status: 'op_status_in_work' | 'op_status_fail' | ... */
    op_work_status?: PbxSalesKpiListFieldItemCode<'op_work_status'>;

    /** op_fail_type: 'garant' | 'go' | 'failure' | ... */
    op_fail_type?: PbxSalesKpiListFieldItemCode<'op_fail_type'>;

    /** op_fail_reason: 'fail_notime' | 'nomoney' | ... */
    op_fail_reason?: PbxSalesKpiListFieldItemCode<'op_fail_reason'>;

    /** op_prospects_type: 'op_prospects_good' | 'op_prospects_nopersp' | ... */
    op_prospects_type?: PbxSalesEventFieldItemCode<'op_prospects_type'>;
}
