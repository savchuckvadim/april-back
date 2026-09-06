/**
 * Результат KPI-слоя AI-аналитики (Фаза 1b): факты самоотчёта менеджера из
 * списка sales_kpi на менеджера и месяц. Счётчики kpi-report (innerCode)
 * переносятся как есть — «0 расхождений» с /kpi-report/get; сверх них —
 * факт `done` по каждому KPI-коду каждого AI-типа (карта
 * AI_ANALYTICS_EVENT_KINDS) и контрольные суммы.
 */
import type {
    AiAnalyticsKpiEventTypeCode,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type { FilterInnerCode } from '../../../shared/dto/kpi.dto';
import type {
    IsoDate,
    IsoMonth,
} from '../../../shared/lib/month-segments.util';

/** План-факт CRM по паре innerCode `*_plan` / `*_done`. */
export interface AiKpiPlanFact {
    plan: number;
    done: number;
}

/** Факт `done` по одному KPI-коду `event_type` (item списка sales_kpi). */
export interface AiKpiCodeFact {
    code: AiAnalyticsKpiEventTypeCode;
    done: number;
}

/**
 * Факт по AI-типу звонка. Суммировать `kpi[]` нельзя: у презентаций три
 * пересекающихся среза, канон — kpiPrimaryEventTypeCode (primaryDone).
 */
export interface AiKpiTypeFact {
    kind: CallReportCallTypeCode;
    /** Факты по KPI-кодам типа в порядке карты; коды без item'а на портале пропущены. */
    kpi: AiKpiCodeFact[];
    /** Заголовочная цифра типа; null — типу нечего считать (см. reason). */
    primaryDone: number | null;
    /** Причина отсутствия цифры: kpiReason карты либо `kpi-item-missing:{code}`. */
    reason: string | null;
}

/** Документные события `act_send` (КП, счета, договоры). */
export interface AiKpiDocuments {
    offers: number;
    offersAfterPresentation: number;
    invoices: number;
    invoicesAfterPresentation: number;
    contracts: number;
}

/** Исходы по списку: продажи и отказы (`ev_success_done` / `ev_fail_done`). */
export interface AiKpiOutcomes {
    success: number;
    fail: number;
}

/**
 * Контроль согласованности per-type батча с kpi-report: сумма `done` по
 * кодам, которые kpi-report сливает в call_done, обязана совпадать с
 * call_done (расхождение — сигнал о дрейфе списка/фильтров).
 */
export interface AiKpiChecks {
    perTypeCallDone: number;
    callDone: number;
}

export interface AiKpiManagerMonth {
    managerId: number;
    /** Сводная строка «Звонок» kpi-report (call_plan / call_done). */
    calls: AiKpiPlanFact;
    /** Презентации «всего» (presentation_plan / presentation_done) — факт планов руководителя. */
    presentations: AiKpiPlanFact;
    /** Уникальные презентации — канон витрины (presentation_uniq_*). */
    presentationsUniq: AiKpiPlanFact;
    /** Презентации по контакту (presentation_contact_uniq_*). */
    presentationsContactUniq: AiKpiPlanFact;
    documents: AiKpiDocuments;
    outcomes: AiKpiOutcomes;
    byType: Record<CallReportCallTypeCode, AiKpiTypeFact>;
    /** Сырые счётчики kpi-report по innerCode (сверка с /kpi-report/get). */
    counters: Partial<Record<FilterInnerCode, number>>;
    checks: AiKpiChecks;
}

export interface AiKpiMonth {
    month: IsoMonth;
    /** Границы сегмента, включительно (yyyy-MM-dd). */
    from: IsoDate;
    to: IsoDate;
    /** Полный календарный месяц, закончившийся до текущего (долгоживущий кэш). */
    closed: boolean;
    fromCache: boolean;
    managers: AiKpiManagerMonth[];
}

export interface AiKpiMonthsResult {
    from: IsoDate;
    to: IsoDate;
    managerIds: number[];
    months: AiKpiMonth[];
}

export interface AiKpiLoadOptions {
    /** Обойти чтение кэша (запись — всегда, write-through). */
    forceRefresh?: boolean;
    /** «Сейчас» для сегментации (тесты). */
    now?: Date;
}
