import { trendMetricTitle } from '../constants/ai-goodhart.const';
import {
    goodhartOf,
    trendSignalsOf,
} from '../domain/presenter/attention-trends.presenter';
import {
    buildAttentionItems,
    toAttentionInput,
    toAttentionInputPhase2,
} from '../domain/presenter/attention.presenter';
import type { AiManagerTrendsDto } from '../dto/ai-trend.dto';
import { managerRow } from './fixtures/norms.fixture';

/**
 * «Внимание» Фазы 3 из блока трендов строки: сигналы и флаги Гудхарта
 * получают подписи метрик, без блока вход совпадает с Фазой 2.
 */
const trends = (
    overrides: Partial<AiManagerTrendsDto> = {},
): AiManagerTrendsDto => ({
    weekKey: '2026-W36',
    calls: 214,
    weeks: 21,
    confidence: 'ok',
    signals: [
        {
            metric: 'edge_presentation_to_offer',
            grain: 'month',
            kind: 'shift',
            direction: 'down',
            sinceWeek: '2026-W27',
            magnitude: -0.2,
            confidence: 'ok',
        },
    ],
    goodhart: [
        {
            pair: 'volume_vs_quality',
            pressure: 'volume',
            counter: 'quality',
            fromKey: '2026-06',
            toKey: '2026-08',
            pressureChange: 0.5,
            counterChange: -0.36,
            points: 3,
        },
    ],
    ...overrides,
});

describe('подписи метрик трендов', () => {
    it('оценка, объём, корзины и рёбра словами без стрелок; чужой код — как есть', () => {
        expect(trendMetricTitle('quality')).toBe('оценка');
        expect(trendMetricTitle('volume')).toBe('число разборов');
        expect(trendMetricTitle('bucket_closing')).toBe('оценка закрытия');
        expect(trendMetricTitle('edge_call_to_presentation')).toBe(
            'доля презентаций после звонков',
        );
        expect(trendMetricTitle('edge_presentation_to_offer')).toBe(
            'доля КП после презентаций',
        );
        expect(trendMetricTitle('edge_offer_to_invoice')).toBe(
            'доля счетов после КП',
        );
        expect(trendMetricTitle('edge_invoice_to_sale')).toBe(
            'доля продаж после счетов',
        );
        expect(trendMetricTitle('edge_nope')).toBe('edge_nope');
    });
});

describe('вход «Внимания» из блока трендов', () => {
    it('сигналы и флаги переносятся с подписями', () => {
        expect(trendSignalsOf(trends())).toEqual([
            expect.objectContaining({
                metric: 'edge_presentation_to_offer',
                title: 'доля КП после презентаций',
                kind: 'shift',
                direction: 'down',
                magnitude: -0.2,
                grain: 'month',
                unit: 'share',
            }),
        ]);
        expect(
            trendSignalsOf(
                trends({
                    signals: [
                        {
                            metric: 'quality',
                            grain: 'week',
                            kind: 'shift',
                            direction: 'down',
                            sinceWeek: '2026-W31',
                            magnitude: -0.8,
                            confidence: 'ok',
                        },
                    ],
                }),
            ),
        ).toEqual([expect.objectContaining({ grain: 'week', unit: 'value' })]);
        expect(goodhartOf(trends())).toEqual([
            expect.objectContaining({
                pair: 'volume_vs_quality',
                pressureTitle: 'число разборов',
                counterTitle: 'оценка',
                pressureChange: 0.5,
                counterChange: -0.36,
            }),
        ]);
    });

    it('блока нет или списки пусты — undefined, вход равен Фазе 2', () => {
        expect(trendSignalsOf(null)).toBeUndefined();
        expect(goodhartOf(undefined)).toBeUndefined();
        expect(goodhartOf(trends({ goodhart: [] }))).toBeUndefined();
        expect(goodhartOf(trends({ goodhart: null }))).toBeUndefined();

        const row = managerRow({});
        expect(toAttentionInputPhase2(row)).toEqual(toAttentionInput(row));
    });

    it('строка с трендами даёт карточки goodhart и trend_shift', () => {
        const row = { ...managerRow({}), trends: trends() };
        const items = buildAttentionItems([row]);

        expect(items.map(item => item.signal)).toEqual([
            'goodhart',
            'trend_shift',
        ]);
        expect(items[0].headline).toBe(
            'За 3 месяца число разборов — больше на 50 %, а оценка — ' +
                'меньше на 36 %: показатель растёт, а результат — нет',
        );
        expect(items[0].availableFrom).toBe(3);
        // Месячный ряд доли ребра: 2026-W27 (29 июня – 5 июля) — неделя
        // 1 июля, величина в пунктах, а не дробью «0,2».
        expect(items[1].headline).toBe(
            'Доля КП после презентаций ниже на 20 пунктов с июля',
        );
    });
});
