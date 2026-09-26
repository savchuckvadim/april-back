/**
 * Правила «Внимания» Фазы 3 (план, потоки П1 и П9): расхождение
 * «метрика ↔ противовес» детектора Гудхарта и сдвиг / дрейф рядов вниз.
 *
 * Формулировки нейтральные: карточка описывает, что ряды разошлись или
 * уровень сместился, и не приписывает человеку намерения (приёмка П9:
 * слов «накрутка» и «обман» в текстах нет — спека проверяет шаблон).
 *
 * Отдельный файл от правил Фазы 1 — лимит 300 строк на файл.
 */
import type { AttentionRule } from './attention.rules';
import type {
    AttentionCandidate,
    AttentionManagerInput,
    AttentionTrendSignal,
} from './attention.types';

const pct = (share: number): string =>
    `${share > 0 ? '+' : '−'}${Math.round(Math.abs(share) * 100)} %`;

/** Величина сигнала в единицах метрики, до одного знака, с запятой. */
const magnitude = (value: number): string =>
    `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1).replace('.', ',')}`;

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
            `${flag.pressureTitle} ${pct(flag.pressureChange)}, ` +
            `${flag.counterTitle} ${pct(flag.counterChange)} за ${flag.points} мес.: ` +
            'метрика растёт, результат — нет',
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

/** Карточка сдвига или дрейфа вниз по одному сигналу. */
function trendCandidate(
    manager: AttentionManagerInput,
    signal: AttentionTrendSignal,
    kind: 'shift' | 'drift',
): AttentionCandidate {
    const label = kind === 'shift' ? 'Уровень сместился вниз' : 'Дрейф вниз';

    return {
        managerId: manager.managerId,
        signal: kind === 'shift' ? 'trend_shift' : 'trend_drift',
        availableFrom: 3,
        severity: CONFIDENCE_SEVERITY[signal.confidence],
        headline:
            `${label}: ${signal.title} ${magnitude(signal.magnitude)} ` +
            `с недели ${signal.sinceWeek}`,
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
