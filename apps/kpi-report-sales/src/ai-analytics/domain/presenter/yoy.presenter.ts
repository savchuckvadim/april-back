/**
 * Блок «год назад» строки менеджера и обзора (план Фазы 3, П3): месячный
 * снапшот `ai-analytics-manager-month` за M−12 рядом с месяцем витрины.
 *
 * Только описательно: ставим числа обоих периодов рядом и называем
 * оговорки. Оценок («лучше», «хуже») здесь нет — пара периодов может
 * различаться по составу и версиям разбора, и решение владельца В9
 * (22.09.2026) прямо требует сравнивать с тем же менеджером, помечая
 * пару `comparable: false` с причиной, а не подменять человека.
 *
 * Молчим, когда показывать нечего: период витрины не месяц, снапшота
 * M−12 нет либо в обоих периодах разборов меньше `n_min_none` — блок
 * `null`, ни одного числа наружу.
 *
 * Чистые функции: форма нагрузки снапшота чужая, читается структурно.
 */
import {
    confidenceFor,
    registryDefault,
    selectSamePeriod,
    type MetricValue,
    type SamePeriodComposition,
    type SamePeriodPair,
} from '@lib/sales-ai-analytics';
import {
    AI_YOY_METRICS,
    AiYoyDto,
    AiYoyMetricDto,
    type AiYoyMetric,
} from '../../dto/ai-yoy.dto';

/** Месяц менеджера глазами витрины: форма чужая, читается структурно. */
export interface YoyMonthView {
    byType?: unknown;
    finance?: unknown;
    level?: unknown;
    passport?: unknown;
    meta?: unknown;
}

/** Всё, что презентеру нужно сверх самих месяцев. */
export interface YoyOptions {
    /** Месяц витрины 'YYYY-MM'; не месяц — блока нет. */
    periodKey: string;
    /** Зерно периода витрины; не 'month' — блока нет. */
    grain?: 'month' | 'week' | 'range';
    /** Отдел сейчас и год назад: сравнение состава (В9). */
    departmentId?: number | null;
    baseDepartmentId?: number | null;
    /** Граница сравнимой истории 'YYYY-MM-DD'; пусто — ряд не рвался. */
    comparableFrom?: string | null;
    /** Даты событий журнала портала между периодами. */
    portalEvents?: readonly string[];
    /** `n_min_none` — порог, ниже которого чисел наружу нет. */
    minN?: number;
}

const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isText = (value: unknown): value is string =>
    typeof value === 'string' && value !== '';

/** Запись нагрузки или пустой объект — чужую форму не разворачиваем. */
function recordOf(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {};
}

/** Неотрицательное целое из нагрузки; иначе 0. */
function countOf(value: unknown): number {
    return isNumber(value) && value > 0 ? Math.floor(value) : 0;
}

/** Метрика «мало данных»: значения нет, объём назван честно. */
function noneMetric(n: number): MetricValue {
    return { value: null, n, confidence: confidenceFor(0, 'score') };
}

/** Метрика оценки по готовому среднему и объёму. */
function scoreOf(value: number | null, n: number): MetricValue {
    const confidence = confidenceFor(n, 'score');
    if (confidence.level === 'none' || value === null) {
        return { value: null, n, confidence };
    }

    return { value, n, confidence };
}

/**
 * Средняя оценка месяца: взвешенное по объёму среднее оценок типов
 * звонков (в нагрузке месяца отдельного балла месяца нет — только
 * `byType[].score`). Типы с `value: null` в среднее не входят: «мало
 * данных» — не ноль.
 */
export function monthQuality(month: YoyMonthView | null): MetricValue {
    const list = Array.isArray(month?.byType) ? month.byType : [];
    let weighted = 0;
    let total = 0;
    for (const item of list) {
        const fact = recordOf(item);
        const score = recordOf(fact.score);
        const n = countOf(fact.n);
        if (!isNumber(score.value) || n <= 0) continue;
        weighted += score.value * n;
        total += n;
    }

    return total === 0 ? noneMetric(0) : scoreOf(weighted / total, total);
}

/** Разобранных звонков месяца — сумма объёмов по типам. */
export function monthAnalyzed(month: YoyMonthView | null): number {
    const list = Array.isArray(month?.byType) ? month.byType : [];

    return list.reduce<number>(
        (sum, item) => sum + countOf(recordOf(item).n),
        0,
    );
}

/** Финансовая величина месяца; неизвестна — null. */
function financeOf(month: YoyMonthView | null, field: string): number | null {
    const value = recordOf(month?.finance)[field];

    return isNumber(value) ? value : null;
}

/** Счётная метрика (разборы, сделки, суммы): объём — она же сама. */
function countMetric(value: number | null, n: number): MetricValue {
    const confidence = confidenceFor(n, 'score');

    return confidence.level === 'none' || value === null
        ? { value: null, n, confidence }
        : { value, n, confidence };
}

/** Величина месяца по коду реестра плюс объём, которым она обеспечена. */
function metricOf(
    month: YoyMonthView | null,
    metric: AiYoyMetric,
): MetricValue {
    const analyzed = monthAnalyzed(month);
    if (metric === 'quality') return monthQuality(month);
    if (metric === 'analyzed_calls') return countMetric(analyzed, analyzed);
    const sales = countOf(financeOf(month, 'salesCount'));
    if (metric === 'sales_count') return countMetric(sales, sales);
    if (metric === 'sales_sum') {
        return countMetric(financeOf(month, 'salesSum'), sales);
    }

    return countMetric(financeOf(month, 'averageCheck'), sales);
}

/** Разница «сейчас минус год назад»; хотя бы одного числа нет — null. */
function deltaOf(current: MetricValue, base: MetricValue): number | null {
    return current.value === null || base.value === null
        ? null
        : current.value - base.value;
}

/** Строка величины; в обоих периодах чисел нет — строки нет. */
function toMetricRow(
    metric: AiYoyMetric,
    current: YoyMonthView | null,
    base: YoyMonthView | null,
): AiYoyMetricDto[] {
    const currentValue = metricOf(current, metric);
    const baseValue = metricOf(base, metric);
    if (currentValue.value === null && baseValue.value === null) return [];

    return [
        {
            metric,
            current: currentValue,
            base: baseValue,
            delta: deltaOf(currentValue, baseValue),
        },
    ];
}

/** Уровень месяца: в нагрузке он строкой, неизвестен — null. */
function levelOf(month: YoyMonthView | null): string | null {
    return isText(month?.level) ? month.level : null;
}

/** Полоса стажа месяца из паспорта нагрузки; неизвестна — null. */
function tenureBandOfMonth(month: YoyMonthView | null): string | null {
    const band = recordOf(month?.passport).tenureBand;

    return isText(band) ? band : null;
}

/** Сигнатура версий разбора месяца из `meta`; неизвестна — null. */
function versionsOf(month: YoyMonthView | null): string | null {
    const meta = recordOf(month?.meta);
    const value = meta.paramsVersion ?? meta.calcVersion;

    return isText(value) ? value : null;
}

/** Состав менеджера на период — вход сравнения пары (В9). */
function compositionOf(
    month: YoyMonthView | null,
    departmentId: number | null | undefined,
): SamePeriodComposition {
    return {
        departmentId: departmentId ?? null,
        level: levelOf(month),
        tenureBand: tenureBandOfMonth(month),
        versions: versionsOf(month),
    };
}

/** Пара периодов и её сопоставимость по двум месяцам менеджера. */
export function yoyPair(
    current: YoyMonthView | null,
    base: YoyMonthView | null,
    options: YoyOptions,
): SamePeriodPair {
    return selectSamePeriod({
        periodKey: options.periodKey,
        ...(options.grain === undefined ? {} : { grain: options.grain }),
        basePresent: base !== null,
        current: compositionOf(current, options.departmentId),
        base: compositionOf(base, options.baseDepartmentId),
        comparableFrom: options.comparableFrom ?? null,
        ...(options.portalEvents === undefined
            ? {}
            : { portalEvents: options.portalEvents }),
    });
}

/**
 * Блок «год назад»: `null` — пары нет (период витрины не месяц либо
 * снапшота M−12 нет) или показывать нечего (в обоих периодах разборов
 * меньше `n_min_none`). Несопоставимость блок не прячет: числа
 * показываются вместе с причинами (В9).
 */
export function toYoyBlock(
    current: YoyMonthView | null,
    base: YoyMonthView | null,
    options: YoyOptions,
): AiYoyDto | null {
    const pair = yoyPair(current, base, options);
    if (!pair.available || pair.basePeriodKey === null) return null;
    const minN = options.minN ?? registryDefault('n_min_none');
    if (monthAnalyzed(current) < minN && monthAnalyzed(base) < minN) {
        return null;
    }
    const metrics = AI_YOY_METRICS.flatMap(metric =>
        toMetricRow(metric, current, base),
    );
    if (metrics.length === 0) return null;

    return {
        periodKey: pair.periodKey ?? options.periodKey,
        basePeriodKey: pair.basePeriodKey,
        comparable: pair.comparable,
        reasons: [...pair.reasons],
        metrics,
    };
}
