import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    buildRecommendationEffect,
    type RecommendationEffectSnapshot,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_RECOMMENDATION_EFFECT_EDGES,
    AI_RECOMMENDATION_EFFECT_RHYTHMS,
    AI_RECOMMENDATION_EFFECT_STEP_CODE,
    AI_RECOMMENDATION_REASONS,
} from '../constants/ai-recommendation-effect.const';
import {
    edgeSamplesOf,
    issuedRecommendationsOf,
} from '../domain/assembler/recommendation-effect.assembler';
import {
    leverObject,
    type AiRecommendationWindow,
} from '../store/ai-analytics-recommendation-log.store';
import {
    effectWindowOf,
    goodhartOf,
    goodhartWeekKeys,
} from '../steps/recommendation-effect.facts';
import { RecommendationEffectStep } from '../steps/recommendation-effect.step';
import type { AiPipelineStepContext } from '../steps/step.types';
import { managerMonth, snapshotRecord } from './fixtures/forecast-log.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';

/**
 * Месячный шаг эффекта советов (Фаза 4, поток B2b): советы месяца
 * `M = месяц расчёта − after`, реакции на них, рёбра «до/после» и флаги
 * Гудхарта → снапшот эффекта за месяц расчёта.
 */
const MONTH = '2026-09';
const KEY = 'volume:volume-gap:call::';

const monthly = (
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext =>
    stepContext({
        rhythm: 'monthly',
        day: '2026-10-03',
        monthKey: MONTH,
        managerIds: [11, 12],
        now: new Date('2026-10-03T01:00:00Z'),
        ...overrides,
    });

const issuedItem = (managerId: string, key = KEY) => ({
    object: leverObject(managerId, key),
    managerId,
    key,
    lever: 'volume' as const,
    monthKey: '2026-07',
});

function journal(): AiRecommendationWindow {
    return {
        issued: [issuedItem('11'), issuedItem('12'), issuedItem('99')],
        done: new Set([leverObject('11', KEY)]),
        disagree: new Set([leverObject('12', KEY)]),
    };
}

const MONTHS = [
    managerMonth('11', '2026-05', 3),
    managerMonth('11', '2026-06', 3),
    managerMonth('11', '2026-08', 3, [
        { edge: 'presentation_to_offer', n: 20, s: 14 },
        { edge: 'offer_to_invoice', n: 14, s: 7 },
        { edge: 'call_to_presentation', n: 100, s: 20 },
    ]),
    managerMonth('11', '2026-09', 3),
    managerMonth('12', '2026-06', 2),
    managerMonth('12', '2026-08', 2),
];

const trendsRecord = (managerId: string, weekKey: string, flags: number) =>
    snapshotRecord(AI_ANALYTICS_SNAPSHOT_TYPE.trends, weekKey, managerId, {
        goodhart: {
            windowMonths: 3,
            drop: 0.1,
            flags: Array.from({ length: flags }, (_, index) => ({ index })),
        },
    });

function makeStep(
    window: AiRecommendationWindow = journal(),
    trends = [
        trendsRecord('11', '2026-W39', 0),
        trendsRecord('12', '2026-W40', 1),
    ],
) {
    const log = { readWindow: jest.fn().mockResolvedValue(window) };
    const loader = { loadMonths: jest.fn().mockResolvedValue(MONTHS) };
    const findByKeys = jest.fn().mockResolvedValue(trends);
    const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'ais-1', supersededIds: [], written: 1 });
    const step = new RecommendationEffectStep(
        log as never,
        loader as never,
        { findByKeys, upsert } as never,
    );
    return { step, log, loader, findByKeys, upsert };
}

const payloadOf = (upsert: jest.Mock): RecommendationEffectSnapshot =>
    (
        upsert.mock.calls as SnapshotEnvelope<RecommendationEffectSnapshot>[][]
    )[0][0].payload;

describe('RecommendationEffectStep — эффект советов', () => {
    it('код и ритмы: месячный и догон истории', () => {
        const { step } = makeStep();
        expect(step.code).toBe(AI_RECOMMENDATION_EFFECT_STEP_CODE);
        expect(step.rhythms).toEqual(AI_RECOMMENDATION_EFFECT_RHYTHMS);
        expect(step.rhythms).toEqual(['monthly', 'backfill']);
    });

    it('ростер пуст — пропуск, журнал не читается', async () => {
        const { step, log } = makeStep();
        const result = await step.run(monthly({ managerIds: [] }));
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_RECOMMENDATION_REASONS.rosterEmpty);
        expect(log.readWindow).not.toHaveBeenCalled();
    });

    it('советов за месяц выдачи нет — пропуск, записи нет', async () => {
        const { step, loader, upsert } = makeStep({
            issued: [issuedItem('99')],
            done: new Set(),
            disagree: new Set(),
        });
        const result = await step.run(monthly());
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_RECOMMENDATION_REASONS.noIssued);
        expect(loader.loadMonths).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it('окно по реестру: советы июля, «до» — май–июнь, «после» — август–сентябрь', async () => {
        const { step, log, loader, findByKeys } = makeStep();
        await step.run(monthly());
        expect(log.readWindow).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            '2026-07',
            MONTH,
        );
        expect(loader.loadMonths).toHaveBeenCalledWith('a.bitrix24.ru', [
            '2026-05',
            '2026-06',
            '2026-08',
            '2026-09',
        ]);
        expect(findByKeys).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            AI_ANALYTICS_SNAPSHOT_TYPE.trends,
            {
                periodKeys: goodhartWeekKeys(MONTH),
                managerIds: ['11', '12'],
                latestOnly: true,
            },
        );
    });

    it('пишет снапшот эффекта за месяц расчёта: выдано, сделано, несогласия, рёбра, Гудхарт', async () => {
        const { step, upsert } = makeStep();
        const result = await step.run(monthly());
        expect(result.status).toBe('ok');
        expect(result.rows).toBe(2);
        expect(result.written).toBe(1);
        const envelope = (
            upsert.mock
                .calls as SnapshotEnvelope<RecommendationEffectSnapshot>[][]
        )[0][0];
        expect(envelope).toMatchObject({
            type: AI_ANALYTICS_SNAPSHOT_TYPE.recommendationEffect,
            periodKey: MONTH,
            managerId: null,
        });
        const payload = envelope.payload;
        expect(payload.monthKey).toBe(MONTH);
        expect(payload.issuedMonths).toEqual(['2026-07']);
        expect(payload.issued).toBe(2);
        expect(payload.done).toBe(1);
        expect(payload.disagree).toBe(1);
        expect(payload.goodhart).toEqual({ flags: 1, managersWithFlags: 1 });
        expect(payload.gate.reasons).toContain('goodhart-flags');
        expect(payload.beforeAfter.map(edge => edge.edge).sort()).toEqual(
            [...AI_RECOMMENDATION_EFFECT_EDGES].sort(),
        );
        const offers = payload.beforeAfter.find(
            edge => edge.edge === 'presentation_to_offer',
        );
        // Два окна: менеджер 11 (май–июнь → август–сентябрь) и 12.
        expect(offers?.n).toBe(2);
        expect(offers?.after).toEqual({ s: 24 + 10, n: 40 + 20 });
    });

    it('переопределение портала lever_effect_months_after сдвигает месяц выдачи', async () => {
        const { step, log } = makeStep();
        await step.run(
            monthly({ registry: { portal: { lever_effect_months_after: 1 } } }),
        );
        expect(log.readWindow).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            '2026-08',
            MONTH,
        );
    });

    it('трендов нет — контроль Гудхарта не применяется, флагов ноль', async () => {
        const { step, upsert } = makeStep(journal(), []);
        await step.run(monthly());
        const payload = payloadOf(upsert);
        expect(payload.goodhart).toEqual({ flags: 0, managersWithFlags: 0 });
        expect(payload.gate.reasons).not.toContain('goodhart-flags');
    });

    it('идемпотентен: повтор даёт ту же нагрузку', async () => {
        const first = makeStep();
        const second = makeStep();
        await first.step.run(monthly());
        await second.step.run(monthly());
        expect(payloadOf(second.upsert)).toEqual(payloadOf(first.upsert));
    });
});

describe('recommendation-effect — сборка и факты', () => {
    it('рёбра окна: суммы по месяцам и кодам, чужие рёбра отброшены', () => {
        expect(
            edgeSamplesOf(
                MONTHS,
                '11',
                ['2026-08', '2026-09'],
                AI_RECOMMENDATION_EFFECT_EDGES,
            ),
        ).toEqual({
            presentation_to_offer: { s: 24, n: 40 },
            offer_to_invoice: { s: 11, n: 24 },
        });
        expect(
            edgeSamplesOf(
                MONTHS,
                '12',
                ['2026-09'],
                AI_RECOMMENDATION_EFFECT_EDGES,
            ),
        ).toBeNull();
    });

    it('совет без месяцев «после» — окно не наблюдалось, без «до» — рёбер нет', () => {
        const [item] = issuedRecommendationsOf({
            issued: [issuedItem('12')],
            done: new Set(),
            disagree: new Set(),
            months: [managerMonth('12', '2026-06', 1)],
            beforeMonths: ['2026-05'],
            afterMonths: ['2026-08'],
            edges: AI_RECOMMENDATION_EFFECT_EDGES,
        });
        expect(item.before).toEqual({});
        expect(item.after).toBeNull();
        expect(item.done).toBe(false);
        expect(
            buildRecommendationEffect({ issued: [item] }).completedWindows,
        ).toBe(0);
    });

    it('окно эффекта: дефолты реестра — два месяца до и после', () => {
        expect(effectWindowOf('2026-02', {})).toEqual({
            issuedMonth: '2025-12',
            beforeMonths: ['2025-10', '2025-11'],
            afterMonths: ['2026-01', '2026-02'],
        });
    });

    it('Гудхарт: последний снапшот трендов каждого менеджера ростера', () => {
        expect(
            goodhartOf(
                [
                    trendsRecord('11', '2026-W40', 0),
                    trendsRecord('11', '2026-W38', 3),
                    trendsRecord('12', '2026-W39', 2),
                    trendsRecord('99', '2026-W40', 5),
                ],
                ['11', '12'],
            ),
        ).toEqual({ flags: 2, managersWithFlags: 1 });
        expect(goodhartOf([], ['11'])).toBeNull();
    });
});
