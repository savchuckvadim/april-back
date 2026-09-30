import 'reflect-metadata';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_POOL_PORTAL_REASONS,
    AI_POOL_REASONS,
    type PoolPortalInput,
    type PoolSnapshot,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import {
    AI_POOL_STEP_CODE,
    AI_POOL_STEP_REASONS,
    AI_POOL_STEP_RHYTHMS,
} from '../constants/ai-pool.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { poolPortalKeyOf } from '../domain/loaders/pool-portals.facts';
import { PoolStep, type PoolBusEntry } from '../steps/pool.step';
import { poolParamsOf, receivesPool } from '../steps/pool.facts';
import { createStepBus, type AiPipelineStepContext } from '../steps/step.types';
import { portalSettings } from './fixtures/lite-row.fixture';
import { stepContext } from './fixtures/manager-snapshot.fixture';
import { poolInput } from './fixtures/pool.fixture';

/**
 * Месячный шаг пула порталов (Фаза 4, П17/П22): портал без согласия
 * ничего не получает, участник получает копию пула под своим доменом,
 * доменов в нагрузке нет, запись идемпотентна.
 */
const DOMAIN = 'a.bitrix24.ru';
const SELF = poolPortalKeyOf(DOMAIN);

type Upsert = jest.Mock<
    Promise<{ id: string; supersededIds: string[]; written: 0 | 1 }>,
    [SnapshotEnvelope<PoolSnapshot>, { force?: boolean }]
>;

function harness(inputs: PoolPortalInput[]) {
    const load = jest.fn().mockResolvedValue(inputs);
    const upsert = jest.fn().mockResolvedValue({
        id: 'pool-1',
        supersededIds: [],
        written: 1,
    }) as Upsert;
    const step = new PoolStep({ load } as never, { upsert } as never);

    return { step, load, upsert };
}

const monthly = (
    patch: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext =>
    stepContext({
        rhythm: 'monthly',
        day: '2026-10-03',
        monthKey: '2026-09',
        now: new Date('2026-10-03T01:00:00Z'),
        settings: portalSettings({
            poolOptIn: true,
            poolConsentAt: '2026-01-15',
        }),
        ...patch,
    });

/** Пять порталов с согласием и историей; первый — текущий. */
const FIVE: PoolPortalInput[] = [
    poolInput(SELF),
    poolInput('k2', { beta: { value: 0.25, se: 0.09, n: 200 } }),
    poolInput('k3', { beta: { value: 0.35, se: 0.1, n: 180 } }),
    poolInput('k4', { beta: null }),
    poolInput('k5', { historyMonths: 2 }),
];

const payloadOf = (upsert: Upsert): SnapshotEnvelope<PoolSnapshot> =>
    upsert.mock.calls[upsert.mock.calls.length - 1][0];

describe('PoolStep — пул порталов', () => {
    it('код и ритмы monthly/backfill', () => {
        const { step } = harness([]);
        expect(step.code).toBe(AI_POOL_STEP_CODE);
        expect(step.rhythms).toEqual(AI_POOL_STEP_RHYTHMS);
        expect([...step.rhythms]).toEqual(['monthly', 'backfill']);
    });

    it('портал без согласия — пропуск not-in-pool: чужие порталы не читаются, ничего не пишется', async () => {
        const h = harness(FIVE);
        const bus = createStepBus();
        const result = await h.step.run(
            monthly({
                settings: portalSettings({
                    poolOptIn: true,
                    poolConsentAt: null,
                }),
            }),
            bus,
        );
        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_POOL_STEP_REASONS.notInPool);
        expect(h.load).not.toHaveBeenCalled();
        expect(h.upsert).not.toHaveBeenCalled();
        expect(bus.get(AI_PIPELINE_BUS_KEYS.pool)).toBeUndefined();
    });

    it('согласие портала позже дня прогона — пропуск до чтения чужих порталов', async () => {
        const h = harness(FIVE);
        const result = await h.step.run(
            monthly({
                settings: portalSettings({
                    poolOptIn: true,
                    poolConsentAt: '2026-10-04',
                }),
            }),
            createStepBus(),
        );
        expect(result.reason).toBe(AI_POOL_STEP_REASONS.notInPool);
        expect(h.load).not.toHaveBeenCalled();
        expect(h.upsert).not.toHaveBeenCalled();
    });

    it('согласие после конца месяца, но до дня прогона — пул месяца не пишется (граница как у модели)', async () => {
        const h = harness(FIVE);
        const bus = createStepBus();
        const result = await h.step.run(
            monthly({
                settings: portalSettings({
                    poolOptIn: true,
                    poolConsentAt: '2026-10-02',
                }),
            }),
            bus,
        );
        expect(result.reason).toBe(AI_POOL_STEP_REASONS.notInPool);
        expect(h.load).not.toHaveBeenCalled();
        expect(h.upsert).not.toHaveBeenCalled();
        expect(bus.get(AI_PIPELINE_BUS_KEYS.pool)).toBeUndefined();
    });

    it('согласие в последний день месяца — пул месяца пишется', async () => {
        const h = harness([
            poolInput(SELF, { consentAt: '2026-09-30' }),
            ...FIVE.slice(1),
        ]);
        const result = await h.step.run(
            monthly({
                settings: portalSettings({
                    poolOptIn: true,
                    poolConsentAt: '2026-09-30',
                }),
            }),
            createStepBus(),
        );
        expect(result.status).toBe('ok');
    });

    it('вердикт пула «согласие ещё не в силе» — пул не выдаётся', async () => {
        const h = harness([
            poolInput(SELF, { consentAt: '2026-12-01' }),
            ...FIVE.slice(1),
        ]);
        const result = await h.step.run(monthly(), createStepBus());
        expect(result.reason).toBe(AI_POOL_STEP_REASONS.notInPool);
        expect(h.upsert).not.toHaveBeenCalled();
    });

    it('участник — копия пула под своим доменом за месяц расчёта и шина pool', async () => {
        const h = harness(FIVE);
        const bus = createStepBus();
        const result = await h.step.run(monthly(), bus);
        expect(result).toMatchObject({ status: 'ok', rows: 5, written: 1 });
        expect(h.load).toHaveBeenCalledWith('2026-09');
        const envelope = payloadOf(h.upsert);
        expect(envelope).toMatchObject({
            domain: DOMAIN,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.pool,
            periodKey: '2026-09',
            managerId: null,
            calcVersion: 'sam-1.0.0',
            paramsVersion: 'pv-1',
        });
        const payload = envelope.payload;
        expect(payload.monthKey).toBe('2026-09');
        expect(payload.status).toBe('estimated');
        expect(payload.eligible).toBe(4);
        expect(payload.selfKey).toBe(SELF);
        expect(payload.beta?.portals).toBe(3);
        expect(payload.edges.map(edge => edge.edge)).toEqual(['e1', 'e2']);
        expect(payload.meta.modelSnapshotId).toBeNull();
        expect(bus.get<PoolBusEntry>(AI_PIPELINE_BUS_KEYS.pool)).toEqual({
            id: 'pool-1',
            payload,
        });
    });

    it('обезличенно: домена в нагрузке нет; таблица лага — точки без функции', async () => {
        const h = harness(FIVE);
        await h.step.run(monthly(), createStepBus());
        const payload = payloadOf(h.upsert).payload;
        expect(JSON.stringify(payload)).not.toContain(DOMAIN);
        expect(payload.portals.map(item => item.portalKey)).toEqual(
            FIVE.map(input => input.portalKey),
        );
        expect(payload.lagCdf?.points.length).toBeGreaterThan(1);
        expect(Object.keys(payload.lagCdf ?? {}).sort()).toEqual([
            'kind',
            'medianDays',
            'n',
            'points',
        ]);
    });

    it('короткая история — пул всё равно выдаётся (в оценку портал не входит)', async () => {
        const inputs = [
            poolInput(SELF, { historyMonths: 2 }),
            ...FIVE.slice(1, 4),
        ];
        const h = harness(inputs);
        await h.step.run(monthly(), createStepBus());
        const payload = payloadOf(h.upsert).payload;
        expect(
            payload.portals.find(item => item.portalKey === SELF)?.reason,
        ).toBe(AI_POOL_PORTAL_REASONS.shortHistory);
        expect(payload.eligible).toBe(3);
    });

    it('мало порталов — снапшот insufficient без чисел', async () => {
        const h = harness(FIVE.slice(0, 2));
        const result = await h.step.run(monthly(), createStepBus());
        expect(result.status).toBe('ok');
        const payload = payloadOf(h.upsert).payload;
        expect(payload.status).toBe('insufficient');
        expect(payload.reasons).toEqual([AI_POOL_REASONS.tooFewPortals]);
        expect(payload.beta).toBeNull();
        expect(payload.edges).toEqual([]);
    });

    it('идемпотентен: тот же вход — та же нагрузка и сигнатура; изменение пула меняет сигнатуру', async () => {
        const h = harness(FIVE);
        await h.step.run(monthly(), createStepBus());
        await h.step.run(monthly({ forceRefresh: true }), createStepBus());
        const [first, second] = h.upsert.mock.calls;
        expect(second[0].payload).toEqual(first[0].payload);
        expect(second[0].inputsHash).toBe(first[0].inputsHash);
        expect(first[0].inputsHash).not.toBe('hash-1');
        expect(first[1]).toEqual({ force: false });
        expect(second[1]).toEqual({ force: true });

        const changed = harness([
            ...FIVE.slice(0, 4),
            poolInput('k5', { historyMonths: 12 }),
        ]);
        await changed.step.run(monthly(), createStepBus());
        expect(payloadOf(changed.upsert).inputsHash).not.toBe(
            first[0].inputsHash,
        );
    });
});

describe('pool.facts — параметры и участие', () => {
    it('параметры пула из реестра портала', () => {
        expect(poolParamsOf({})).toEqual({
            minPortals: 3,
            minPortalsBeta: 3,
            minHistoryMonths: 6,
        });
        expect(
            poolParamsOf({ portal: { pool_min_history_months: 12 } })
                .minHistoryMonths,
        ).toBe(12);
    });

    it('портала нет среди вердиктов — пул не выдаётся', () => {
        expect(
            receivesPool(
                {
                    status: 'insufficient',
                    now: '2026-10-03',
                    eligible: 0,
                    reasons: [],
                    edges: [],
                    beta: null,
                    lagCdf: null,
                    lognormal: null,
                    seasonIndex: null,
                    evidence: { betaPortals: 0, minPortalsE2: 8, ready: false },
                    portals: [],
                },
                SELF,
            ),
        ).toBe(false);
    });
});
