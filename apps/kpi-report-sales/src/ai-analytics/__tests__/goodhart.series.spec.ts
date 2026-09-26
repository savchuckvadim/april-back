import { TREND_DEFAULTS } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_FUNNEL_EDGE_CODES } from '../constants/ai-overview.const';
import {
    buildGoodhartFacts,
    goodhartSeriesOf,
    monthQualityOf,
} from '../domain/assembler/goodhart.series';
import type { TrendSnapshotRecord } from '../domain/assembler/trends.series';

/**
 * Месячные ряды детектора Гудхарта (Фаза 3, П9): оценка и объём из
 * `byType`, доли рёбер из `edges`, синтетика накрутки против честного
 * роста, окно короче трёх месяцев.
 */
const PARAMS = {
    minN: 8,
    windowMonths: 3,
    drop: 0.3,
    alpha: TREND_DEFAULTS.alphaLong,
};

/** Нагрузка месяца: оценка/объём презентаций и доли двух первых рёбер. */
function monthPayload(
    score: number | null,
    n: number,
    rates: { callToPresentation: number; presentationToOffer: number },
): Record<string, unknown> {
    return {
        byType: [
            {
                callType: 'presentation',
                n,
                score: { value: score, n, confidence: { level: 'ok' } },
            },
            { callType: 'call', n: 4, score: { value: null, n: 4 } },
        ],
        edges: AI_ANALYTICS_FUNNEL_EDGE_CODES.map((edge, index) => ({
            edge,
            n: 50,
            s: Math.round(
                50 *
                    (index === 0
                        ? rates.callToPresentation
                        : index === 1
                          ? rates.presentationToOffer
                          : 0.3),
            ),
        })),
    };
}

const record = (
    periodKey: string,
    payload: Record<string, unknown>,
): TrendSnapshotRecord => ({ periodKey, managerId: '10', payload });

describe('monthQualityOf — оценка и объём месяца из byType', () => {
    it('среднее оценок типов, взвешенное по n; объём — сумма всех типов', () => {
        const payload = {
            byType: [
                { callType: 'a', n: 10, score: { value: 8 } },
                { callType: 'b', n: 30, score: { value: 6 } },
                { callType: 'c', n: 5, score: { value: null } },
            ],
        };

        expect(monthQualityOf(payload, 8)).toEqual({
            quality: 6.5,
            volume: 45,
        });
    });

    it('оценённых разборов меньше minN — оценки нет, объём считается', () => {
        expect(
            monthQualityOf({ byType: [{ n: 5, score: { value: 7 } }] }, 8),
        ).toEqual({ quality: null, volume: 5 });
        expect(monthQualityOf({}, 8)).toEqual({ quality: null, volume: 0 });
    });
});

describe('goodhartSeriesOf — ряды по месяцам', () => {
    it('оценка, объём и рёбра; месяц без оценки выпадает только из ряда оценки', () => {
        const series = goodhartSeriesOf(
            [
                record(
                    '2026-06',
                    monthPayload(7, 20, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.4,
                    }),
                ),
                record(
                    '2026-07',
                    monthPayload(null, 20, {
                        callToPresentation: 0.3,
                        presentationToOffer: 0.4,
                    }),
                ),
            ],
            8,
            null,
        );
        const byMetric = new Map(
            series.map(item => [item.metric, item.points]),
        );

        expect(byMetric.get('quality')?.map(point => point.key)).toEqual([
            '2026-06',
        ]);
        expect(byMetric.get('volume')?.map(point => point.value)).toEqual([
            24, 24,
        ]);
        expect(
            byMetric
                .get('edge_call_to_presentation')
                ?.map(point => point.value),
        ).toEqual([0.2, 0.3]);
    });

    it('граница сравнимой истории отбрасывает ранние месяцы', () => {
        const series = goodhartSeriesOf(
            [
                record(
                    '2026-05',
                    monthPayload(7, 20, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.4,
                    }),
                ),
                record(
                    '2026-06',
                    monthPayload(7, 20, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.4,
                    }),
                ),
            ],
            8,
            '2026-06',
        );

        expect(
            series.find(item => item.metric === 'volume')?.points,
        ).toHaveLength(1);
    });
});

describe('buildGoodhartFacts — факты для нагрузки трендов', () => {
    it('объём ×1,5 при падении оценки на треть → флаг volume_vs_quality', () => {
        const facts = buildGoodhartFacts(
            [
                record(
                    '2026-06',
                    monthPayload(7.5, 20, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.4,
                    }),
                ),
                record(
                    '2026-07',
                    monthPayload(6, 24, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.4,
                    }),
                ),
                record(
                    '2026-08',
                    monthPayload(4.5, 30, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.4,
                    }),
                ),
            ],
            { ...PARAMS, alpha: 1 },
            null,
        );

        expect(facts).toMatchObject({ windowMonths: 3, drop: 0.3 });
        expect(facts?.flags.map(flag => flag.pair)).toEqual([
            'volume_vs_quality',
        ]);
        expect(facts?.flags[0]).toMatchObject({
            pressure: 'volume',
            counter: 'quality',
            fromKey: '2026-06',
            toKey: '2026-08',
            points: 3,
        });
    });

    it('доля первого ребра растёт, следующего — падает → флаг пары рёбер', () => {
        const facts = buildGoodhartFacts(
            [
                record(
                    '2026-06',
                    monthPayload(7, 20, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.5,
                    }),
                ),
                record(
                    '2026-07',
                    monthPayload(7, 20, {
                        callToPresentation: 0.3,
                        presentationToOffer: 0.4,
                    }),
                ),
                record(
                    '2026-08',
                    monthPayload(7, 20, {
                        callToPresentation: 0.4,
                        presentationToOffer: 0.3,
                    }),
                ),
            ],
            { ...PARAMS, alpha: 1 },
            null,
        );

        expect(facts?.flags.map(flag => flag.pair)).toEqual([
            'call_to_presentation_vs_offer',
        ]);
    });

    it('честный рост всего — флагов нет; двух месяцев — детектор молчит (null)', () => {
        const honest = buildGoodhartFacts(
            [
                record(
                    '2026-06',
                    monthPayload(6, 20, {
                        callToPresentation: 0.2,
                        presentationToOffer: 0.3,
                    }),
                ),
                record(
                    '2026-07',
                    monthPayload(6.5, 24, {
                        callToPresentation: 0.25,
                        presentationToOffer: 0.35,
                    }),
                ),
                record(
                    '2026-08',
                    monthPayload(7, 30, {
                        callToPresentation: 0.3,
                        presentationToOffer: 0.4,
                    }),
                ),
            ],
            PARAMS,
            null,
        );
        expect(honest?.flags).toEqual([]);

        expect(
            buildGoodhartFacts(
                [
                    record(
                        '2026-07',
                        monthPayload(7, 20, {
                            callToPresentation: 0.2,
                            presentationToOffer: 0.4,
                        }),
                    ),
                    record(
                        '2026-08',
                        monthPayload(4, 30, {
                            callToPresentation: 0.2,
                            presentationToOffer: 0.4,
                        }),
                    ),
                ],
                PARAMS,
                null,
            ),
        ).toBeNull();
    });
});
