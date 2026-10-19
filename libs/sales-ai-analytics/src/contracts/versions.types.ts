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
 * СЕРИИ СРАВНИМОСТИ ПРОМПТОВ: версия → дата начала её серии.
 *
 * Политика (решение владельца 19.10.2026 — «ждёшь три месяца, чуть промпт
 * меняешь — опять три месяца ждать»):
 * - МИНОРНАЯ правка — не меняет оценки разделов (уточнение определений и
 *   доказательств риск-флагов, новый флаг, формулировки без смены рубрики
 *   и шкалы): версия получает новую дату в строке, а здесь — запись с
 *   датой серии предыдущей версии; ряд не рвётся.
 * - Правка ПО СУЩЕСТВУ (оценки разделов, состав ответа, вход модели):
 *   новая дата в строке версии и БЕЗ записи здесь — ряд разрывается.
 * Версии без записи ведут себя как раньше: дата серии = дата в строке.
 */
export const PROMPT_SERIES_START = {
    // v2.4 (20.10.2026): определения и доказательства риск-флагов, флаг
    // door_closed; рубрика и оценки разделов не менялись — серия v2.3.
    'focus-v2.4-2026-10-20': '2026-09-25',
} as const satisfies Readonly<Record<string, string>>;

/**
 * Дата серии сравнимости версии: запись таблицы серий, иначе дата из
 * строки версии; ни того, ни другого — null.
 */
export function versionSeriesDate(value: string): string | null {
    const series = (PROMPT_SERIES_START as Readonly<Record<string, string>>)[
        value
    ];
    return series ?? versionDate(value);
}

/**
 * Начало сравнимой истории — максимум из дат разрывов ряда. Принимает как
 * чистые даты, так и строки версий с датой внутри (для версии из таблицы
 * серий берётся дата серии); строки без даты игнорируются; нет ни одной
 * даты → ''.
 */
export function comparableFrom(dates: readonly string[]): string {
    return dates
        .map(versionSeriesDate)
        .filter((date): date is string => date !== null)
        .reduce((max, date) => (date > max ? date : max), '');
}

/** comparableFrom по всем полям AnalysisVersions. */
export function comparableFromVersions(versions: AnalysisVersions): string {
    return comparableFrom(Object.values(versions));
}
