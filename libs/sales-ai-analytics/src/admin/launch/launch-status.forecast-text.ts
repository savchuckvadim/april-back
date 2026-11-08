/**
 * Проверка точности прогноза простыми словами — для сводки запуска и
 * ответа 409 ручки stage-flags (жалоба владельца 08.11.2026: «какая вилка
 * и факт — непонятно, что с этим делать»). Словарь: «вилка» → диапазон
 * «от–до», «факт» → итог месяца, «середина» → средняя оценка, MASE →
 * «ошибается на N % меньше / больше, чем простой расчёт». Чистые функции.
 */
import { formatRuDate, RU_MONTHS_GENITIVE } from '../../model/iso-week.util';
import type { Phase4BacktestView } from '../services/ai-analytics-phase4.types';

const pct = (share: number): number => Math.round(share * 100);

/** Простые расчёты, с которыми сравнивается средняя оценка прогноза. */
export const FORECAST_SIMPLE_METHODS = {
    naive: 'расчёт «по темпу» (продажи с начала месяца, растянутые на весь месяц)',
    mean3: 'расчёт «как в среднем за три прошлых месяца»',
} as const;

type SimpleMethod = keyof typeof FORECAST_SIMPLE_METHODS;

/** Причина проверки, которую даёт сравнение с простым расчётом. */
const MASE_REASON: Record<SimpleMethod, string> = {
    naive: 'mase-naive',
    mean3: 'mase-mean3',
};

const SIMPLE_METHODS: readonly SimpleMethod[] = ['naive', 'mean3'];

const maseOf = (
    view: Phase4BacktestView,
    method: SimpleMethod,
): { value: number | null; ci: number[] | null } =>
    method === 'naive'
        ? { value: view.maseNaive, ci: view.maseNaiveCi90 }
        : { value: view.maseMean3, ci: view.maseMean3Ci90 };

/**
 * Не прошла ли средняя оценка сравнение, хотя в среднем она точнее:
 * гейт смотрит на неудачные кварталы истории (верх CI90 бутстрапа).
 */
const unstableWin = (
    view: Phase4BacktestView,
    method: SimpleMethod,
): boolean => {
    const { value } = maseOf(view, method);
    return (
        value !== null &&
        value < 1 &&
        view.reasons.includes(MASE_REASON[method])
    );
};

/** Средняя оценка против одного простого расчёта одной фразой. */
function versusText(
    view: Phase4BacktestView,
    method: SimpleMethod,
): string | null {
    const { value, ci } = maseOf(view, method);
    if (value === null || !Number.isFinite(value)) return null;
    const label = FORECAST_SIMPLE_METHODS[method];
    const diff = Math.round(Math.abs(1 - value) * 100);
    if (diff === 0) return `ошибается так же, как ${label}`;
    if (value > 1) return `ошибается на ${diff} % больше, чем ${label}`;
    const base = `ошибается на ${diff} % меньше, чем ${label}`;
    if (!unstableWin(view, method)) return base;
    const worst =
        ci !== null && ci.length === 2 && ci[1] > 1
            ? Math.round((ci[1] - 1) * 100)
            : 0;
    return worst > 0
        ? `${base}, но не стабильно: в неудачные кварталы истории — до ${worst} % хуже`
        : `${base}, но не стабильно: в неудачные кварталы истории не лучше`;
}

/** «итог месяца попадал в диапазон «от–до» в 52 % дней (нужно не меньше 80 %)». */
function rangeText(view: Phase4BacktestView): string | null {
    if (view.coverageShare === null) return null;
    const target =
        view.coverageTarget === null
            ? ''
            : ` (нужно не меньше ${pct(view.coverageTarget)} %)`;
    return `итог месяца попадал в диапазон «от–до» в ${pct(view.coverageShare)} % дней${target}`;
}

/**
 * Цифры проверки словами: насколько точна средняя оценка и насколько
 * честен диапазон «от–до».
 */
export function backtestNumbersText(view: Phase4BacktestView): string {
    const versus = SIMPLE_METHODS.map(method =>
        versusText(view, method),
    ).filter((text): text is string => text !== null);
    const range = rangeText(view);
    const sentences: string[] = [];
    if (versus.length > 0) {
        sentences.push(`Средняя оценка прогноза ${versus.join('; ')}.`);
    }
    if (range) sentences.push(`Диапазон «от–до»: ${range}.`);
    return sentences.join(' ');
}

/** «по итогам октября 2026» из 'YYYY-MM'; не ключ месяца — «за <ключ>». */
export function monthPhrase(monthKey: string): string {
    const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
    const month = match ? Number(match[2]) : 0;
    return match && month >= 1 && month <= 12
        ? `по итогам ${RU_MONTHS_GENITIVE[month - 1]} ${match[1]}`
        : `за ${monthKey}`;
}

/** «, посчитана 2 ноября 2026» по generatedAt снапшота. */
export function computedPhrase(generatedAt: string | null): string {
    return generatedAt
        ? `, посчитана ${formatRuDate(generatedAt.slice(0, 10))}`
        : '';
}

/**
 * Что делать при провале — без хода по кругу: «восстановить» советуется
 * только при узком диапазоне и с оговоркой, что повтор кнопками не лечит.
 */
export function failAdvice(view: Phase4BacktestView): string {
    const worse = SIMPLE_METHODS.some(method => {
        const { value } = maseOf(view, method);
        return (
            view.reasons.includes(MASE_REASON[method]) &&
            (value === null || value >= 1)
        );
    });
    if (worse) {
        return 'Средняя оценка пока не точнее простых расчётов — такой прогноз показывать незачем. Проверка повторится сама после закрытия следующего месяца.';
    }
    const parts: string[] = [];
    if (SIMPLE_METHODS.some(method => unstableWin(view, method))) {
        parts.push(
            'В среднем прогноз уже точнее простых расчётов, но выигрыш держится не во все кварталы истории; проверка повторится сама после закрытия следующего месяца.',
        );
    }
    if (view.reasons.includes('coverage-below')) {
        parts.push(
            'Диапазон «от–до» узковат. Он расширяется по прошлым месяцам при пересчёте: нажмите «Восстановить прогноз по истории» — через 10–30 минут проверка пересчитается. Если и после этого не пройдено, кнопками это не исправить — нужна доработка расчёта диапазона.',
        );
    }
    return parts.length > 0 ? parts.join(' ') : 'Показывать прогноз пока рано.';
}
