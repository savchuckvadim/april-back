/**
 * Разложение прогноза отдела на слагаемые — ответ админ-ручки
 * `forecast-breakdown`, по отделу и по каждому менеджеру, с входами
 * расчёта. Только сохранённые числа ночного расчёта. DTO ответа реализуют
 * эти интерфейсы.
 *
 * Слагаемые зависят от метода дня (`method`): `presentations-v2` —
 * закрыто + от проведённых презентаций (`pipeline`) + от новых
 * презентаций (`newFlow`), открытые сделки — справочно, вне суммы
 * (`deals`); `calls-v1` (записи до 18.11.2026) — закрыто + открытые
 * сделки + новые встречи по звонкам. Поля `pipeline`/`newFlow` сохраняют
 * имена, чтобы админка до 18.11.2026 не ломалась.
 */
import type {
    AiForecastEntry,
    AiForecastFlowSource,
    AiForecastMethod,
    PresentationFlowReason,
    PresentationFlowStatus,
} from '../../model/presentation-flow.types';

/** Открытая сделка и её вклад в ожидание. */
export interface ForecastBreakdownEpisodeView {
    id: string | null;
    ageDays: number;
    theta: number | null;
    expected: number;
}

/** Слагаемые прогноза: закрыто, «уже в работе», новые. */
export interface ForecastBreakdownParts {
    /** Метод расчёта дня; нет поля в записи — `calls-v1`. */
    method: AiForecastMethod;
    /** Середина прогноза месяца. */
    p50: number;
    /** Закрытые продажи месяца. */
    done: number;
    /**
     * `presentations-v2` — от проведённых презентаций; `calls-v1` — от
     * открытых сделок. null — слагаемое не сохранено или истории стадий нет.
     */
    pipeline: number | null;
    /**
     * `presentations-v2` — от новых презентаций до конца месяца;
     * `calls-v1` — от новых встреч (звонков). null — не сохранено.
     */
    newFlow: number | null;
}

/** Подбор прогноза от презентаций на день (портал). */
export interface ForecastBreakdownFlowView {
    status: PresentationFlowStatus;
    reason: PresentationFlowReason | null;
    /** Счётчик презентаций; null — в записи нет. */
    entry: AiForecastEntry | null;
    /** Продаж на презентацию по отделу. */
    q: number;
    /** Затухание сдвига продажи по месяцам. */
    rho: number;
    /** Сдвиг подобран по истории портала; false — взят по умолчанию. */
    lagEstimated: boolean;
    /** Менеджеров, посчитанных по своим продажам. */
    salesHistoryManagers: number;
}

/** Входы прогноза от презентаций по менеджеру. */
export interface ForecastBreakdownManagerFlowView {
    source: AiForecastFlowSource;
    presentationsDone: number;
    presentationsRate: number;
    salesPerPresentation: number;
    /** Доля продаж в месяц презентации. */
    sameMonthShare: number;
    /** Доля оставшихся рабочих дней месяца. */
    remainingShare: number;
    /** Прошлые презентации с весами сдвига. */
    pastPresentations: number;
    /** Средние продажи за три месяца; null — истории нет. */
    salesMean: number | null;
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
    /** Подбор от презентаций; null — день старого расчёта. */
    flow: ForecastBreakdownFlowView | null;
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
    /**
     * Ожидание от открытых сделок — справочно, в середину не входит
     * (`presentations-v2`); null — старый расчёт (там это `pipeline`) или
     * истории стадий нет.
     */
    deals: number | null;
    /** Входы прогноза от презентаций; null — старый расчёт. */
    flow: ForecastBreakdownManagerFlowView | null;
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
