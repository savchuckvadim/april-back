import {
    AI_ANALYTICS_CLOSED_MONTH_TTL_SECONDS,
    AI_ANALYTICS_LIVE_TTL_SECONDS,
    buildFinanceMonthKey,
    buildFinancePipelineKey,
    buildKpiMonthKey,
    buildManagersKey,
    buildPlansKey,
    monthSegmentTtlSeconds,
} from '../domain/loaders/loader-cache-key.util';
import { AI_ANALYTICS_CACHE_PREFIX } from '../constants/ai-analytics.const';
import type { MonthSegment } from '../../shared/lib/month-segments.util';

const closedAugust: MonthSegment = {
    from: '2026-08-01',
    to: '2026-08-31',
    month: '2026-08',
    cacheable: true,
};
const partialJuly: MonthSegment = {
    from: '2026-07-15',
    to: '2026-07-31',
    month: '2026-07',
    cacheable: false,
};

describe('loader-cache-key.util', () => {
    it('закрытый месяц — ключ без границ дней, неполный сегмент несёт from_to', () => {
        expect(buildKpiMonthKey('d', closedAugust, '1_2')).toBe(
            `${AI_ANALYTICS_CACHE_PREFIX}:d:kpi-month:2026-08:1_2`,
        );
        expect(buildKpiMonthKey('d', partialJuly, '1_2')).toBe(
            `${AI_ANALYTICS_CACHE_PREFIX}:d:kpi-month:2026-07:1_2:2026-07-15_2026-07-31`,
        );
        expect(buildFinanceMonthKey('d', closedAugust, 'all')).toBe(
            `${AI_ANALYTICS_CACHE_PREFIX}:d:finance-month:2026-08:all`,
        );
    });

    it('ключи пайплайна, планов и ростера', () => {
        expect(buildFinancePipelineKey('d', 'presentation-document', '1')).toBe(
            `${AI_ANALYTICS_CACHE_PREFIX}:d:finance-pipeline:presentation-document:1`,
        );
        expect(buildPlansKey('d', '1_2')).toBe(
            `${AI_ANALYTICS_CACHE_PREFIX}:d:plans:1_2`,
        );
        expect(buildManagersKey('d')).toBe(
            `${AI_ANALYTICS_CACHE_PREFIX}:d:managers`,
        );
    });

    it('TTL: закрытый месяц 30 дней, живой сегмент 180 с', () => {
        expect(monthSegmentTtlSeconds(closedAugust)).toBe(
            AI_ANALYTICS_CLOSED_MONTH_TTL_SECONDS,
        );
        expect(monthSegmentTtlSeconds(partialJuly)).toBe(
            AI_ANALYTICS_LIVE_TTL_SECONDS,
        );
        expect(AI_ANALYTICS_CLOSED_MONTH_TTL_SECONDS).toBe(30 * 24 * 3600);
        expect(AI_ANALYTICS_LIVE_TTL_SECONDS).toBe(180);
    });
});
