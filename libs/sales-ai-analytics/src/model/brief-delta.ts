/**
 * Сравнение фактов резюме с прошлым периодом той же длины (версия 2
 * «что изменилось»): границы прошлого периода, изменение и его описание
 * словами без причинности и без «значимо».
 *
 * Числа в описании печатаются теми же функциями, что и в пакете
 * (`formatFactValue`), поэтому фраза шаблона проходит факт-чек: прошлое
 * значение и модуль изменения входят в допустимые числа факта
 * (`factNumberKeys`). Слова «вдвое», «втрое» чисел не содержат.
 *
 * Чистые функции: без DI, времени и случайности.
 */
import {
    AI_BRIEF_FACT_PRIORITY,
    type AiBriefFact,
    type AiEvidencePack,
    type BriefPeriod,
} from '../contracts/ai-brief.contract';
import { formatFactValue } from './brief-numbers';
import { shiftDate } from './workdays.util';

const MS_PER_DAY = 86_400_000;

/** Календарных дней периода включительно; кривые даты — 1. */
export function periodDays(from: string, to: string): number {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return 1;
    }

    return Math.round((end - start) / MS_PER_DAY) + 1;
}

/**
 * Прошлый период той же длины, примыкающий к текущему: заканчивается за
 * день до `from`. Неделя 1–7 сентября → 25–31 августа; 1–30 сентября →
 * 2–31 августа (длина в днях, не «календарный месяц»). Даты — календарные
 * дни портала, поэтому часовой пояс на границы не влияет.
 */
export function previousPeriod(from: string, to: string): BriefPeriod {
    const days = periodDays(from, to);
    const prevTo = shiftDate(from, -1);

    return { from: shiftDate(prevTo, -(days - 1)), to: prevTo };
}

/** Изменение к прошлому периоду: разница и проценты; нет prev — нули null. */
export function compareFact(
    value: number | null,
    prev: number | null | undefined,
): { delta: number | null; deltaPct: number | null } {
    if (
        value === null ||
        prev === null ||
        prev === undefined ||
        !Number.isFinite(value) ||
        !Number.isFinite(prev)
    ) {
        return { delta: null, deltaPct: null };
    }
    const delta = value - prev;
    const deltaPct =
        prev === 0
            ? null
            : Math.round((delta / Math.abs(prev)) * 100 * 10) / 10;

    return { delta: Math.round(delta * 1e6) / 1e6, deltaPct };
}

/**
 * Факт сравнивается с прошлым периодом: у пакета сравнение есть, а у
 * факта заполнены прошлое значение и изменение. Пакет без сравнения
 * (несопоставим, нет данных, расчёт не готов) изменений не печатает.
 */
export function isCompared(pack: AiEvidencePack, fact: AiBriefFact): boolean {
    return (
        pack.compare.reason === null &&
        fact.comparable &&
        fact.value !== null &&
        typeof fact.prev === 'number' &&
        typeof fact.delta === 'number'
    );
}

/** Единицы, у которых изменение печатается разницей, а не «было X %». */
const ABSOLUTE_UNITS: ReadonlySet<AiBriefFact['unit']> = new Set([
    'count',
    'rub',
    'sec',
    'days',
    'score',
]);

const PREV_PHRASE = 'чем за прошлый период';
const SAME_PHRASE = 'столько же, сколько за прошлый период';

/**
 * Кратность словами говорится только там, где она близка к целой:
 * «вдвое» — от 1,9 до 2,5 раза, «втрое» — от 2,75 до 3,5. Вне этих
 * полос (в том числе при росте в пять раз или падении до нуля) печатается
 * точная разница — слово не должно округлять сильнее, чем читатель ждёт.
 */
const RATIO_BANDS = [
    { min: 1.9, max: 2.5, more: 'вдвое больше', less: 'вдвое меньше' },
    { min: 2.75, max: 3.5, more: 'втрое больше', less: 'втрое меньше' },
] as const;

/** Слово о кратности: «вдвое», «втрое»; null — кратность не выражена. */
function ratioWord(value: number, prev: number): string | null {
    if (prev <= 0 || value <= 0) return null;
    const grew = value > prev;
    const ratio = grew ? value / prev : prev / value;
    const band = RATIO_BANDS.find(
        item => ratio >= item.min && ratio < item.max,
    );
    if (band === undefined) return null;

    return grew ? band.more : band.less;
}

/**
 * Изменение словами: «вдвое больше, чем за прошлый период (31)», «меньше
 * на 2, чем за прошлый период (5)», «столько же, сколько за прошлый
 * период», для долей — «ниже, чем за прошлый период (было 22,4 %)».
 * Значения, которые печатаются одинаково («17,8 %» и «17,8 %»), считаются
 * равными. Пустая строка — факт не сравним.
 */
export function describeDelta(fact: AiBriefFact): string {
    const { value, prev, delta, unit } = fact;
    if (
        !fact.comparable ||
        value === null ||
        prev === null ||
        prev === undefined ||
        delta === null ||
        delta === undefined
    ) {
        return '';
    }
    const prevText = formatFactValue(prev, unit);
    if (delta === 0 || formatFactValue(value, unit) === prevText) {
        return SAME_PHRASE;
    }
    if (!ABSOLUTE_UNITS.has(unit)) {
        return `${delta > 0 ? 'выше' : 'ниже'}, ${PREV_PHRASE} (было ${prevText})`;
    }
    if (prev === 0 && value > 0) {
        return 'за прошлый период не было';
    }
    const word = ratioWord(value, prev);
    if (word !== null) {
        return `${word}, ${PREV_PHRASE} (${prevText})`;
    }
    const step = formatFactValue(Math.abs(delta), unit);

    return `${delta > 0 ? 'больше' : 'меньше'} на ${step}, ${PREV_PHRASE} (${prevText})`;
}

/**
 * Фраза изменения факта: «Сигналов риска за период: 68 — вдвое больше,
 * чем за прошлый период (31)»; несравнимый факт — его готовая фраза.
 */
export function describeChange(fact: AiBriefFact): string {
    const delta = describeDelta(fact);

    return delta === ''
        ? fact.text
        : `${fact.title}: ${formatFactValue(fact.value, fact.unit)} — ${delta}`;
}

/**
 * Сила изменения для порядка пунктов, когда прошлое значение — ноль и
 * процент посчитать нельзя: «не было — появилось» ставится наравне с
 * удвоением.
 */
const FROM_ZERO_WEIGHT_PCT = 100;

/**
 * Сила изменения факта для сортировки: модуль изменения в процентах;
 * «с нуля» — `FROM_ZERO_WEIGHT_PCT`; несравнимый факт — −1.
 */
export function changeWeight(pack: AiEvidencePack, fact: AiBriefFact): number {
    if (!isCompared(pack, fact)) return -1;
    if (typeof fact.deltaPct === 'number') return Math.abs(fact.deltaPct);

    return fact.delta === 0 ? 0 : FROM_ZERO_WEIGHT_PCT;
}

const priorityOf = (fact: AiBriefFact): number => {
    const index = AI_BRIEF_FACT_PRIORITY.indexOf(fact.kind);

    return index === -1 ? AI_BRIEF_FACT_PRIORITY.length : index;
};

/**
 * Самое сильное изменение пакета: сравнимый факт с наибольшей силой
 * изменения; при равенстве — старший по приоритету вида. null — сравнения
 * у пакета нет либо ни один факт не изменился.
 */
export function strongestChange(pack: AiEvidencePack): AiBriefFact | null {
    let best: AiBriefFact | null = null;
    let bestWeight = 0;
    for (const fact of pack.facts) {
        const weight = changeWeight(pack, fact);
        if (weight <= 0) continue;
        if (
            best === null ||
            weight > bestWeight ||
            (weight === bestWeight && priorityOf(fact) < priorityOf(best))
        ) {
            best = fact;
            bestWeight = weight;
        }
    }

    return best;
}
