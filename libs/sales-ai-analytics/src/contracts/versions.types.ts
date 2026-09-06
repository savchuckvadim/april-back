/**
 * Версии разбора звонка (план, раздел 5.4) — пререквизит трендов: смена любой
 * из них разрывает ряд. Пишутся в user_result разбора (поле versions),
 * константы значений живут в apps/event-sales call-report-versions.const.ts.
 */
export interface AnalysisVersions {
    /** Версия промпта фокус-анализа. */
    prompt: string;
    /** Версия рубрики (набор разделов). */
    rubric: string;
    /** Хэш реестра (профили типов звонков). */
    registry: string;
    /** Дата смены атрибуции менеджера. */
    attribution: string;
    /** Дата смены классификатора типов. */
    classifier: string;
}

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;

/** Дата YYYY-MM-DD из строки версии ('focus-v2.1-2026-09-05' → '2026-09-05'). */
export function versionDate(value: string): string | null {
    return ISO_DATE_RE.exec(value)?.[0] ?? null;
}

/**
 * Начало сравнимой истории — максимум из дат разрывов ряда. Принимает как
 * чистые даты, так и строки версий с датой внутри; строки без даты
 * игнорируются; нет ни одной даты → ''.
 */
export function comparableFrom(dates: readonly string[]): string {
    return dates
        .map(versionDate)
        .filter((date): date is string => date !== null)
        .reduce((max, date) => (date > max ? date : max), '');
}

/** comparableFrom по всем полям AnalysisVersions. */
export function comparableFromVersions(versions: AnalysisVersions): string {
    return comparableFrom(Object.values(versions));
}
