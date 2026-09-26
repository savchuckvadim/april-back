import { buildAttention } from '../model/attention';
import {
    goodhartRule,
    trendDriftRule,
    trendShiftRule,
} from '../model/attention.rules.phase3';
import {
    ATTENTION_DEFAULT_RULES,
    ATTENTION_SIGNALS,
    type AttentionGoodhartFlag,
    type AttentionManagerInput,
    type AttentionTrendSignal,
} from '../model/attention.types';
import { rateMetric } from '../model/metric';

/**
 * Правила «Внимания» Фазы 3: карточка Гудхарта с нейтральным текстом,
 * сдвиг и дрейф вниз (рост — не сигнал), порядок сигналов после Фазы 1.
 */
const manager = (
    patch: Partial<AttentionManagerInput> = {},
): AttentionManagerInput => ({
    managerId: 'm1',
    n: 30,
    nextStepRate: { current: rateMetric(20, 40), previous: rateMetric(20, 40) },
    riskCalls: [],
    discipline: {
        callPlan: 0,
        callDone: 0,
        presentationPlan: 0,
        presentationDone: 0,
    },
    ...patch,
});

const flag = (
    overrides: Partial<AttentionGoodhartFlag> = {},
): AttentionGoodhartFlag => ({
    pair: 'volume_vs_quality',
    pressure: 'volume',
    pressureTitle: 'разборов',
    counter: 'quality',
    counterTitle: 'оценка',
    fromKey: '2026-06',
    toKey: '2026-08',
    pressureChange: 0.5,
    counterChange: -0.36,
    points: 3,
    ...overrides,
});

const signal = (
    overrides: Partial<AttentionTrendSignal> = {},
): AttentionTrendSignal => ({
    metric: 'quality',
    title: 'оценка',
    kind: 'shift',
    direction: 'down',
    sinceWeek: '2026-W31',
    magnitude: -0.8,
    confidence: 'ok',
    ...overrides,
});

/** Слова, которых в текстах карточек быть не должно (приёмка П9). */
const FORBIDDEN = /накрут|обман|манипул|мухлёж|подтасов/i;

describe('goodhartRule — расхождение «метрика ↔ противовес»', () => {
    it('первый флаг → карточка с процентами и нейтральным текстом', () => {
        const item = goodhartRule(
            manager({ goodhart: [flag(), flag({ pair: 'other' })] }),
            ATTENTION_DEFAULT_RULES,
        );

        expect(item).toEqual({
            managerId: 'm1',
            signal: 'goodhart',
            availableFrom: 3,
            severity: -0.36,
            headline:
                'разборов +50 %, оценка −36 % за 3 мес.: метрика растёт, результат — нет',
            basis: [
                { code: 'goodhart_pressure_change', value: 0.5, n: 3 },
                { code: 'goodhart_counter_change', value: -0.36, n: 3 },
            ],
            link: { managerId: 'm1' },
        });
        expect(item?.headline).not.toMatch(FORBIDDEN);
    });

    it('флагов нет или список пуст — карточки нет', () => {
        expect(goodhartRule(manager(), ATTENTION_DEFAULT_RULES)).toBeNull();
        expect(
            goodhartRule(manager({ goodhart: [] }), ATTENTION_DEFAULT_RULES),
        ).toBeNull();
    });
});

describe('trendShiftRule / trendDriftRule — только вниз и с доверием', () => {
    it('сдвиг вниз → карточка с подписью метрики и неделей начала', () => {
        const item = trendShiftRule(
            manager({ trendSignals: [signal()] }),
            ATTENTION_DEFAULT_RULES,
        );

        expect(item).toMatchObject({
            signal: 'trend_shift',
            availableFrom: 3,
            severity: -2,
            headline: 'Уровень сместился вниз: оценка −0,8 с недели 2026-W31',
            basis: [{ code: 'trend_shift_magnitude', value: -0.8, n: 0 }],
        });
        expect(item?.headline).not.toMatch(FORBIDDEN);
    });

    it('рост, доверие none и чужой вид — не сигнал', () => {
        const rules = ATTENTION_DEFAULT_RULES;
        expect(
            trendShiftRule(
                manager({ trendSignals: [signal({ direction: 'up' })] }),
                rules,
            ),
        ).toBeNull();
        expect(
            trendShiftRule(
                manager({ trendSignals: [signal({ confidence: 'none' })] }),
                rules,
            ),
        ).toBeNull();
        expect(
            trendDriftRule(manager({ trendSignals: [signal()] }), rules),
        ).toBeNull();
    });

    it('дрейф вниз с доверием low — тяжесть мягче, чем у ok', () => {
        const item = trendDriftRule(
            manager({
                trendSignals: [
                    signal({
                        kind: 'drift',
                        confidence: 'low',
                        magnitude: -0.3,
                    }),
                ],
            }),
            ATTENTION_DEFAULT_RULES,
        );

        expect(item).toMatchObject({
            signal: 'trend_drift',
            severity: -1,
            headline: 'Дрейф вниз: оценка −0,3 с недели 2026-W31',
        });
    });
});

describe('buildAttention с сигналами Фазы 3', () => {
    it('порядок: сигналы Фазы 1 раньше goodhart, затем сдвиг и дрейф', () => {
        const items = buildAttention({
            managers: [
                manager({
                    riskCalls: [{ transcriptionId: 't1', kind: 'promise' }],
                    goodhart: [flag()],
                    trendSignals: [
                        signal({ kind: 'drift' }),
                        signal({ kind: 'shift' }),
                    ],
                }),
            ],
        });

        // ≤ 3 карточек на менеджера: risk, goodhart, trend_shift.
        expect(items.map(item => item.signal)).toEqual([
            'risk',
            'goodhart',
            'trend_shift',
        ]);
        expect(ATTENTION_SIGNALS.slice(-3)).toEqual([
            'goodhart',
            'trend_shift',
            'trend_drift',
        ]);
    });
});
