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
    pressureTitle: 'число разборов',
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
                'За 3 месяца число разборов — больше на 50 %, а оценка — ' +
                'меньше на 36 %: показатель растёт, а результат — нет',
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
            // 2026-W31 начинается в понедельник 27 июля — в тексте дата, не ключ;
            // без «уровня» и знака минуса, число 0,8 остаётся для факт-чека.
            headline: 'Оценка ниже на 0,8 с недели 27 июля',
            basis: [{ code: 'trend_shift_magnitude', value: -0.8, n: 0 }],
        });
        expect(item?.headline).not.toMatch(FORBIDDEN);
    });

    it('подпись любого рода и составная подпись ребра встают в заголовок', () => {
        const rules = ATTENTION_DEFAULT_RULES;
        const volume = trendShiftRule(
            manager({
                trendSignals: [
                    signal({
                        metric: 'volume',
                        title: 'число разборов',
                        magnitude: -3,
                    }),
                ],
            }),
            rules,
        );
        expect(volume?.headline).toBe(
            'Число разборов ниже на 3,0 с недели 27 июля',
        );
        const edge = trendDriftRule(
            manager({
                trendSignals: [
                    signal({
                        metric: 'edge_presentation_to_offer',
                        title: 'доля КП после презентаций',
                        kind: 'drift',
                        magnitude: -0.26,
                        grain: 'month',
                        unit: 'share',
                    }),
                ],
            }),
            rules,
        );
        // Доля месячного ряда — в пунктах, начало — месяцем: неделя
        // 2026-W31 (27 июля – 2 августа) записана как неделя 1 августа.
        expect(edge?.headline).toBe(
            'Доля КП после презентаций постепенно снижается: на 26 пунктов с августа',
        );
        for (const item of [volume, edge]) {
            expect(item?.headline).not.toMatch(/[-→×−+]|уровень|дрейф/i);
        }
    });

    it('доля ребра: малый сдвиг в пунктах, а не «0,0»; неделя без первого числа — неделей', () => {
        const edge = (overrides: Partial<AttentionTrendSignal>) =>
            trendShiftRule(
                manager({
                    trendSignals: [
                        signal({
                            metric: 'edge_offer_to_invoice',
                            title: 'доля счетов после КП',
                            grain: 'month',
                            unit: 'share',
                            ...overrides,
                        }),
                    ],
                }),
                ATTENTION_DEFAULT_RULES,
            )?.headline;

        expect(edge({ magnitude: -0.04 })).toBe(
            'Доля счетов после КП ниже на 4 пункта с августа',
        );
        expect(edge({ magnitude: -0.07, sinceWeek: '2026-W36' })).toBe(
            'Доля счетов после КП ниже на 7 пунктов с сентября',
        );
        expect(edge({ magnitude: -0.004 })).toBe(
            'Доля счетов после КП ниже меньше чем на 1 пункт с августа',
        );
        // 2026-W30 — 20–26 июля: первого числа нет, остаётся неделя.
        expect(edge({ magnitude: -0.1, sinceWeek: '2026-W30' })).toBe(
            'Доля счетов после КП ниже на 10 пунктов с недели 20 июля',
        );
        // Без единицы и зерна (старый вход) — как раньше, баллы и неделя.
        expect(
            edge({ magnitude: -0.8, grain: undefined, unit: undefined }),
        ).toBe('Доля счетов после КП ниже на 0,8 с недели 27 июля');
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
            headline: 'Оценка постепенно снижается: на 0,3 с недели 27 июля',
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
