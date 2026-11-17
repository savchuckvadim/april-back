import { DEFAULT_WORK_CALENDAR } from '../../workdays.util';
import { DigestCardInput, buildManagerDigestCard } from '../period-digest.card';
import { DIGEST_RECOMMENDATION_CODE as CODE } from '../period-digest.codes';
import { buildDigestMetrics } from '../period-digest.metrics';
import { newDigestRecommendation } from '../period-digest.status';
import {
    DIGEST_ANCHOR_MIN_N,
    DIGEST_DEFAULT_SHIFT,
} from '../period-digest.thresholds';
import type { DigestPeriodKind } from '../period-digest.types';
import type { DatedLiteRow } from '../../dated-lite-row';
import {
    DIGEST_PERIODS,
    MIN_DURATION,
    THRESHOLDS,
    digestCalls,
    sectionAsWas,
} from './digest-context.fixture';

/** Слабы оба раздела презентации и возражения на доработке. */
const ROWS = [
    ...digestCalls('p', 'presentation', 5, () => ({
        sections: [sectionAsWas('NEEDS', 4), sectionAsWas('PRESENTATION', 4)],
    })),
    ...digestCalls('r', 'refine', 5, () => ({
        objections: [false, false, false, true].map(handled => ({
            category: 'price',
            quote: null,
            handled,
            outcome: null,
        })),
    })),
];

const metricsOf = (rows: readonly DatedLiteRow[], kind: DigestPeriodKind) =>
    buildDigestMetrics({
        rows,
        period: DIGEST_PERIODS[kind],
        calendar: DEFAULT_WORK_CALENDAR,
        minDurationByType: MIN_DURATION,
        minN: DIGEST_ANCHOR_MIN_N[kind],
        lowScoreCallMax: THRESHOLDS.lowScoreCallMax,
    });

const cardInput = (
    rows: readonly DatedLiteRow[],
    kind: DigestPeriodKind = 'month',
    patch: Partial<DigestCardInput> = {},
): DigestCardInput => ({
    period: DIGEST_PERIODS[kind],
    manager: {
        id: '10',
        name: 'Анна Иванова',
        departmentId: 7,
        departmentName: 'Продажи 1',
    },
    rows,
    metrics: metricsOf(rows, kind),
    peers: null,
    settings: {
        thresholds: THRESHOLDS,
        minDurationByType: MIN_DURATION,
        minCalls: 5,
        shift: DIGEST_DEFAULT_SHIFT,
    },
    previous: null,
    yearAgo: null,
    ...patch,
});

const monthNeeds = newDigestRecommendation({
    code: CODE.presentationNeeds,
    text: 'Выяснять задачи клиента до показа',
    source: 'template',
    anchor: {
        metric: 'section_mean',
        section: 'NEEDS',
        callTypes: ['presentation'],
    },
    periodKey: '2026-09',
    baseline: { value: 4.2, n: 7 },
    target: 5.2,
    evidence: { transcriptionIds: [], quote: null },
});

describe('сборка карточки «менеджер × период»', () => {
    it('месяц: метрики, сравнения, рекомендации по приоритету, блок для РОПа', () => {
        const before = metricsOf(ROWS.slice(0, 7), 'month');
        const card = buildManagerDigestCard(
            cardInput(ROWS, 'month', {
                previous: {
                    periodKey: '2026-09',
                    metrics: before,
                    recommendations: [],
                },
                yearAgo: { periodKey: '2025-10', metrics: before },
            }),
        );

        expect(card).toMatchObject({
            schemaVersion: 1,
            period: { kind: 'month', key: '2026-10' },
            managerId: '10',
            readiness: 'ok',
            standings: { score: null, nextStepDated: null },
            previous: {
                periodKey: '2026-09',
                analyzed: { delta: 3 },
                versionsDiffer: false,
            },
            yearAgo: { periodKey: '2025-10' },
        });
        expect(card.recommendations.map(item => item.code)).toEqual([
            CODE.presentationNeeds,
            CODE.presentationFit,
            CODE.followupObjections,
        ]);
        expect(card).not.toHaveProperty('weeklySteps');
        expect(card.forRop.listen.length).toBeGreaterThan(0);
        expect(card.forRop.listen.length).toBeLessThanOrEqual(3);
    });

    it('другая серия версий разбора — сравнение с пометкой', () => {
        const before = {
            ...metricsOf(ROWS, 'month'),
            seriesStart: '2026-12-01',
        };
        const card = buildManagerDigestCard(
            cardInput(
                ROWS.map(row => ({
                    ...row,
                    versions: { prompt: 'focus-v3.1-2026-11-06' },
                })),
                'month',
                {
                    previous: {
                        periodKey: '2026-09',
                        metrics: before,
                        recommendations: [],
                    },
                },
            ),
        );

        expect(card.previous?.versionsDiffer).toBe(true);
    });

    it('мало данных — новых нет, перенесённые оцениваются', () => {
        const rows = ROWS.slice(0, 3);
        const card = buildManagerDigestCard(
            cardInput(rows, 'month', {
                previous: {
                    periodKey: '2026-09',
                    metrics: null,
                    recommendations: [monthNeeds],
                },
            }),
        );

        expect(card.readiness).toBe('few_data');
        expect(card.recommendations).toHaveLength(1);
        expect(card.recommendations[0]).toMatchObject({
            code: CODE.presentationNeeds,
            evaluations: 1,
            status: 'no_data',
        });
    });

    it('нет звонков — пустая карточка без рекомендаций', () => {
        const card = buildManagerDigestCard(cardInput([]));

        expect(card).toMatchObject({
            readiness: 'no_calls',
            metrics: { recorded: 0, analyzed: 0 },
            recommendations: [],
            previous: null,
            yearAgo: null,
            forRop: { discuss: [], listen: [] },
        });
    });

    it('неделя с месячной карточкой: шаги к цели, свои — по другим кодам, не больше двух', () => {
        const card = buildManagerDigestCard(
            cardInput(ROWS, 'week', { month: [monthNeeds] }),
        );

        expect(card.weeklySteps?.map(step => step.code)).toEqual([
            CODE.presentationNeeds,
        ]);
        expect(card.weeklySteps?.[0].state).toBe('behind');
        expect(card.recommendations.map(item => item.code)).toEqual([
            CODE.presentationFit,
            CODE.followupObjections,
        ]);
        expect(card.yearAgo).toBeNull();
    });

    it('неделя без месячной карточки — свои рекомендации как обычно', () => {
        const card = buildManagerDigestCard(
            cardInput(ROWS, 'week', { month: null }),
        );

        expect(card.weeklySteps).toEqual([]);
        expect(card.recommendations.map(item => item.code)).toEqual([
            CODE.presentationNeeds,
            CODE.presentationFit,
        ]);
    });
});
