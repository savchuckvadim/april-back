import 'reflect-metadata';
import type { BetaSample, DealEpisode } from '@lib/sales-ai-analytics';
import { AI_QUALITY_LINK_SKIP_REASONS } from '../constants/ai-quality-link.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { iccFormOf, sampleHorizonOf } from '../steps/quality-link.facts';
import { createStepBus } from '../steps/step.types';
import { goldenReport } from './fixtures/quality-link.fixture';
import {
    PORTAL,
    busWith,
    harness,
    monthly,
} from './fixtures/quality-link-step.fixture';

/**
 * Защиты шага «связь качества с результатом» (Фаза 4, П15/П20): прогон без
 * шага истории стадий не затирает оценку месяца, цензура в догоне истории
 * идёт по горизонту данных, ICC ≤ 0 не выбрасывается из `r`.
 */

const TZ = 'Europe/Moscow';

/** Последняя сделка портала — открытая презентация (исход после дня прогона). */
function withOpenLastDeal(): DealEpisode[] {
    const last = PORTAL.episodes.reduce((a, b) =>
        a.startedAt > b.startedAt ? a : b,
    ).entityId;

    return PORTAL.episodes.flatMap((episode): DealEpisode[] => {
        if (episode.entityId !== last) return [episode];
        if (episode.index > 0) return [];

        return [
            {
                ...episode,
                endedAt: null,
                toStageCode: null,
                toOrder: null,
                end: 'censored',
                endReason: 'open',
                durationDays: null,
                success: false,
            },
        ];
    });
}

describe('QualityLinkStep — защиты', () => {
    it('шага истории стадий в прогоне не было — пропуск без записи и шины', async () => {
        const h = harness();
        const bus = createStepBus();
        const result = await h.step.run(monthly(), bus);
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(
            AI_QUALITY_LINK_SKIP_REASONS.stageHistoryMissing,
        );
        expect(h.upsert).not.toHaveBeenCalled();
        expect(h.loadLite).not.toHaveBeenCalled();
        expect(bus.get(AI_PIPELINE_BUS_KEYS.qualityLink)).toBeUndefined();
    });

    it('история стадий пропущена (глубина 0) — это «нет истории», снапшот пишется', async () => {
        const h = harness();
        const bus = createStepBus();
        bus.set(AI_PIPELINE_BUS_KEYS.historyMonths, 0);
        const result = await h.step.run(monthly(), bus);
        expect(result.status).toBe('ok');
        expect(h.upsert).toHaveBeenCalledTimes(1);
    });

    it('догон истории: окно звонка за днём прогона — цензура, а не исход 0', async () => {
        const h = harness();
        const bus = busWith(withOpenLastDeal());
        await h.step.run(
            monthly({
                rhythm: 'backfill',
                day: '2026-09-30',
                now: new Date('2026-12-01T00:00:00Z'),
            }),
            bus,
        );
        const sample = bus.get<BetaSample>(AI_PIPELINE_BUS_KEYS.betaSample);
        const lastCall = `t${PORTAL.rows.length}`;
        expect(sample?.rows.some(row => row.callId === lastCall)).toBe(false);
        expect(sample?.dropped.censored).toBeGreaterThanOrEqual(1);
    });

    it('горизонт — момент запуска, но не позже конца дня прогона портала', () => {
        const dayEnd = portalRangeUtc('2026-09-30', '2026-09-30', TZ).to;
        expect(
            sampleHorizonOf(new Date('2026-12-01T00:00:00Z'), '2026-09-30', TZ),
        ).toBe(dayEnd.toISOString());
        expect(
            sampleHorizonOf(new Date('2026-10-03T01:00:00Z'), '2026-10-03', TZ),
        ).toBe('2026-10-03T01:00:00.000Z');
    });

    it('ICC ≤ 0 раздела формы входит в r нулём, а не выбрасывается', () => {
        const report = goldenReport([
            { code: 'section_GREETING', icc21: 0.8 },
            { code: 'section_NEEDS', icc21: -0.2 },
            { code: 'section_CLOSING', icc21: null },
        ]);
        expect(iccFormOf(report, ['GREETING', 'NEEDS', 'CLOSING'])).toBeCloseTo(
            0.4,
            12,
        );
        expect(
            iccFormOf(goldenReport([{ code: 'section_NEEDS', icc21: -0.1 }]), [
                'NEEDS',
            ]),
        ).toBe(0);
        expect(iccFormOf(report, ['OBJECTIONS'])).toBeNull();
        expect(iccFormOf(null, ['GREETING'])).toBeNull();
    });
});
