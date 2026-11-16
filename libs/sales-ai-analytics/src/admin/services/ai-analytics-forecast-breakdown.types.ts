/**
 * Разложение прогноза отдела на слагаемые — ответ админ-ручки
 * `forecast-breakdown`: закрыто + ожидание от открытых сделок + ожидание от
 * новых встреч, по отделу и по каждому менеджеру, с входами расчёта и
 * самыми «тяжёлыми» открытыми сделками. Только сохранённые числа ночного
 * расчёта. DTO ответа реализуют эти интерфейсы.
 */

/** Открытая сделка и её вклад в ожидание. */
export interface ForecastBreakdownEpisodeView {
    id: string | null;
    ageDays: number;
    theta: number | null;
    expected: number;
}

/** Слагаемые прогноза: закрыто, открытые сделки, новые встречи. */
export interface ForecastBreakdownParts {
    /** Середина прогноза месяца. */
    p50: number;
    /** Закрытые продажи месяца. */
    done: number;
    /** Ожидание от открытых сделок; null — слагаемое не сохранено или истории стадий нет. */
    pipeline: number | null;
    /** Ожидание от новых встреч до конца месяца; null — слагаемое не сохранено. */
    newFlow: number | null;
}

export interface ForecastBreakdownDepartmentView
    extends ForecastBreakdownParts {
    /** День журнала 'YYYY-MM-DD'. */
    day: string;
    monthKey: string;
    low: number;
    high: number;
    /** Простой расчёт по темпу с начала месяца. */
    naive: number;
    /** Среднее продаж трёх прошлых месяцев; null — истории нет. */
    mean3: number | null;
    /** Менеджеров в расчёте. */
    managers: number;
    /** Из них без истории стадий (ожидание от сделок неполное). */
    pipelineUnknown: number;
}

export interface ForecastBreakdownManagerView extends ForecastBreakdownParts {
    managerId: string;
    naive: number;
    /** Цель месяца; null — не задана. */
    target: number | null;
    /** Входы расчёта; null — запись сделана до появления разложения. */
    entryDone: number | null;
    entryRate: number | null;
    conversion: number | null;
    fBar: number | null;
    openEpisodes: number | null;
    topEpisodes: ForecastBreakdownEpisodeView[];
}

export interface ForecastBreakdownView {
    domain: string;
    /** День, за который показано разложение; null — данных нет. */
    day: string | null;
    /** Журнал отдела за день; null — журнала нет. */
    department: ForecastBreakdownDepartmentView | null;
    /** Менеджеры по убыванию середины прогноза. */
    managers: ForecastBreakdownManagerView[];
}
