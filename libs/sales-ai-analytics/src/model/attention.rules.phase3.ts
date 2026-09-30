/**
 * Правила «Внимания» Фазы 3 (план, потоки П1 и П9): расхождение
 * «метрика ↔ противовес» детектора Гудхарта и сдвиг / дрейф рядов вниз.
 *
 * Формулировки нейтральные: карточка описывает, что ряды разошлись или
 * показатель стал ниже, и не приписывает человеку намерения (приёмка П9:
 * слов «накрутка» и «обман» в текстах нет — спека проверяет шаблон).
 * Тексты без жаргона и знаков (правило владельца): «уровень», «дрейф»,
 * стрелки и знак минуса в заголовках не используются, числа остаются.
 *
 * Отдельный файл от правил Фазы 1 — лимит 300 строк на файл.
 */
import type { AttentionRule } from './attention.rules';
import type {
    AttentionCandidate,
    AttentionManagerInput,
    AttentionTrendSignal,
} from './attention.types';
import { upperFirst } from './dictionary-titles.util';
import { formatRuMonthSince, formatRuWeekSince } from './iso-week.util';
import { RU_FORMS, ruCount, ruDecimal } from './ru-text.util';

/** Величина изменения без знака: направление называет текст словами. */
const pctAbs = (share: number): string =>
    `${Math.round(Math.abs(share) * 100)} %`;

/**
 * Величина сигнала в единицах метрики без знака, до одного знака, с
 * запятой: направление называет текст словами («ниже», «снижается»),
 * а число остаётся для факт-чека резюме.
 */
const magnitude = (value: number): string => ruDecimal(Math.abs(value));

/** Доля 0..1 в процентных пунктах: «на 7 пунктов», меньше 1 — словами. */
function sharePoints(value: number): string {
    const points = Math.round(Math.abs(value) * 100);

    return points === 0
        ? 'меньше чем на 1 пункт'
        : `на ${ruCount(points, RU_FORMS.points)}`;
}

/**
 * «на 0,8 с недели 27 июля» — баллы недели; «на 7 пунктов с сентября» —
 * доля месячного ряда (ребро воронки): дробь 0,1 читалась бы как балл.
 */
function trendTail(signal: AttentionTrendSignal): string {
    const size =
        signal.unit === 'share'
            ? sharePoints(signal.magnitude)
            : `на ${magnitude(signal.magnitude)}`;
    const since =
        signal.grain === 'month'
            ? formatRuMonthSince(signal.sinceWeek)
            : formatRuWeekSince(signal.sinceWeek);

    return `${size} ${since}`;
}

/** Тяжесть по доверию ряда: ok важнее low (величины рядов несравнимы). */
const CONFIDENCE_SEVERITY = { ok: -2, low: -1, none: 0 } as const;

/**
 * goodhart — за окно давление выросло, противовес упал. Флаги уже
 * отсортированы детектором (худший противовес первым) — берётся первый.
 */
export const goodhartRule: AttentionRule = manager => {
    const flag = manager.goodhart?.[0];
    if (flag === undefined) return null;

    return {
        managerId: manager.managerId,
        signal: 'goodhart',
        availableFrom: 3,
        severity: flag.counterChange,
        headline:
            `За ${ruCount(flag.points, RU_FORMS.months)} ${flag.pressureTitle} — ` +
            `больше на ${pctAbs(flag.pressureChange)}, а ${flag.counterTitle} — ` +
            `меньше на ${pctAbs(flag.counterChange)}: показатель растёт, ` +
            'а результат — нет',
        basis: [
            {
                code: 'goodhart_pressure_change',
                value: flag.pressureChange,
                n: flag.points,
            },
            {
                code: 'goodhart_counter_change',
                value: flag.counterChange,
                n: flag.points,
            },
        ],
        link: { managerId: manager.managerId },
    };
};

/** Первый сигнал вида с направлением вниз и доверием выше none. */
function firstDown(
    manager: AttentionManagerInput,
    kind: AttentionTrendSignal['kind'],
): AttentionTrendSignal | undefined {
    return manager.trendSignals?.find(
        signal =>
            signal.kind === kind &&
            signal.direction === 'down' &&
            signal.confidence !== 'none',
    );
}

/**
 * Заголовок сдвига или дрейфа вниз словами, без «уровня», «дрейфа» и
 * знаков: «Оценка ниже на 0,8 с недели 27 июля», «Оценка постепенно
 * снижается: на 0,3 с недели 27 июля». Подпись метрики стоит подлежащим
 * в именительном падеже, а сказуемое выбрано так, чтобы не зависеть от
 * рода подписи («оценка», «доля …», «число разборов»).
 */
function trendHeadline(
    signal: AttentionTrendSignal,
    kind: 'shift' | 'drift',
): string {
    const subject = upperFirst(signal.title);
    const tail = trendTail(signal);

    return kind === 'shift'
        ? `${subject} ниже ${tail}`
        : `${subject} постепенно снижается: ${tail}`;
}

/** Карточка сдвига или дрейфа вниз по одному сигналу. */
function trendCandidate(
    manager: AttentionManagerInput,
    signal: AttentionTrendSignal,
    kind: 'shift' | 'drift',
): AttentionCandidate {
    return {
        managerId: manager.managerId,
        signal: kind === 'shift' ? 'trend_shift' : 'trend_drift',
        availableFrom: 3,
        severity: CONFIDENCE_SEVERITY[signal.confidence],
        headline: trendHeadline(signal, kind),
        basis: [
            {
                code: `trend_${kind}_magnitude`,
                value: signal.magnitude,
                n: 0,
            },
        ],
        link: { managerId: manager.managerId },
    };
}

/** trend_shift — сдвиг уровня ряда вниз (CUSUM), рост не сигнал. */
export const trendShiftRule: AttentionRule = manager => {
    const signal = firstDown(manager, 'shift');

    return signal === undefined
        ? null
        : trendCandidate(manager, signal, 'shift');
};

/** trend_drift — дрейф ряда вниз (двойная EWMA), рост не сигнал. */
export const trendDriftRule: AttentionRule = manager => {
    const signal = firstDown(manager, 'drift');

    return signal === undefined
        ? null
        : trendCandidate(manager, signal, 'drift');
};

/** Правила Фазы 3 в порядке приоритета сигналов. */
export const ATTENTION_PHASE3_RULES: readonly AttentionRule[] = [
    goodhartRule,
    trendShiftRule,
    trendDriftRule,
];
