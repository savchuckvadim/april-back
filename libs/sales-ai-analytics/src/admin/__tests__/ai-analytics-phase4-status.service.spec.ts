import type { AiEntityDto } from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '../../contracts/snapshot-kinds.const';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import { AiAnalyticsPhase4StatusService } from '../services/ai-analytics-phase4-status.service';

const DOMAIN = 'april.bitrix24.ru';
const META = { calcVersion: 'sam-1.0.0', modelSnapshotId: null };

let seq = 0;

/** ais-запись снапшота в конверте (как пишет конвейер приложения). */
function snapshot(
    type: string,
    periodKey: string,
    payload: unknown,
    over: { status?: string; createdAt?: string } = {},
): AiEntityDto {
    seq += 1;
    return {
        id: String(seq),
        type,
        domain: DOMAIN,
        activity_id: periodKey,
        model: 'sam-1.0.0',
        status: over.status ?? 'done',
        user_id: 0,
        tokens_count: 0,
        price: 0,
        createdAt: new Date(over.createdAt ?? `${periodKey}-28T01:00:00.000Z`),
        user_result: {
            managerId: null,
            paramsVersion: 'p',
            inputsHash: 'h',
            generatedAt: `${periodKey}-28T01:00:00.000Z`,
            payload,
        },
    } as unknown as AiEntityDto;
}

function makeService(records: AiEntityDto[]) {
    const aiService = {
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    return {
        service: new AiAnalyticsPhase4StatusService(
            new AiAnalyticsAdminSnapshotStore(aiService as never),
        ),
        aiService,
    };
}

const backtest = (status: string, shadowMonths: number) => ({
    monthKey: 'x',
    status,
    reasons: status === 'pass' ? [] : ['not-enough-months'],
    shadowMonths,
    shadowMinMonths: 9,
    backtest: {
        status,
        reasons: [],
        months: ['2026-06', '2026-07'],
        days: 40,
        level: 0.8,
        coverage: {
            share: 0.8,
            covered: 32,
            days: 40,
            ci90: [0.68, 0.88],
            target: 0.8,
        },
        errors: { p50: 2, naive: 3, mean3: 3 },
        mase: {
            naive: { value: 0.7, ci90: [0.5, 0.9], draws: 200 },
            mean3: { value: null, ci90: null, draws: 0 },
            max: 1,
        },
        pinball: { low: 1, high: 2, mean: 1.5 },
        pit: { belowP50Share: 0.5, bins: [] },
    },
    meta: META,
});

describe('AiAnalyticsPhase4StatusService — пул порталов', () => {
    it('последний месяц, участники обезличенно, свой ключ и β', async () => {
        const pool = {
            monthKey: '2026-09',
            status: 'estimated',
            reasons: [],
            eligible: 3,
            edges: [{}, {}],
            beta: {
                betaPool: 0.2,
                se: 0.05,
                ci90: [0.12, 0.28],
                q: 3,
                df: 2,
                iSquared: 0.3,
                tau2: 0.01,
                tau2Source: 'estimated',
                label: 'hybrid',
                portals: 3,
            },
            lagCdf: null,
            lognormal: null,
            seasonIndex: null,
            evidence: { betaPortals: 3, minPortalsE2: 3, ready: true },
            portals: [
                { portalKey: 'aaa', included: true, reason: 'included' },
                { portalKey: 'bbb', included: true, reason: 'included' },
                { portalKey: 'ccc', included: false, reason: 'no-consent' },
            ],
            selfKey: 'bbb',
            meta: META,
        };
        const { service, aiService } = makeService([
            snapshot(AI_ANALYTICS_SNAPSHOT_TYPE.pool, '2026-08', {
                ...pool,
                eligible: 1,
            }),
            snapshot(AI_ANALYTICS_SNAPSHOT_TYPE.pool, '2026-09', pool),
        ]);

        const result = await service.poolStatus(DOMAIN);

        const [, types] = aiService.findByDomainTypesInPeriod.mock.calls[0] as [
            string,
            string[],
        ];
        expect(types).toEqual([AI_ANALYTICS_SNAPSHOT_TYPE.pool]);
        expect(result.domain).toBe(DOMAIN);
        expect(result.latest).toMatchObject({
            monthKey: '2026-09',
            status: 'estimated',
            eligible: 3,
            participants: 2,
            selfKey: 'bbb',
            selfIncluded: true,
            edges: 2,
            beta: {
                value: 0.2,
                ci90: [0.12, 0.28],
                iSquared: 0.3,
                portals: 3,
                label: 'hybrid',
            },
            evidenceReady: true,
        });
        expect(result.latest?.portals).toEqual([
            { key: 'aaa', included: true, reason: 'included' },
            { key: 'bbb', included: true, reason: 'included' },
            { key: 'ccc', included: false, reason: 'no-consent' },
        ]);
        // Доменов других порталов в ответе нет.
        expect(JSON.stringify(result.latest)).not.toContain('bitrix24');
    });

    it('снапшота нет или форма чужая — latest = null', async () => {
        const { service } = makeService([
            snapshot(AI_ANALYTICS_SNAPSHOT_TYPE.pool, '2026-09', {
                status: 'магия',
            }),
        ]);
        expect(await service.poolStatus(DOMAIN)).toEqual({
            domain: DOMAIN,
            latest: null,
        });
    });
});

describe('AiAnalyticsPhase4StatusService — проверка точности прогноза', () => {
    it('по одной актуальной записи на месяц, свежие первыми, не больше months; superseded пропускается', async () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest;
        const { service } = makeService([
            snapshot(type, '2026-06', backtest('insufficient', 2)),
            snapshot(type, '2026-08', backtest('fail', 4), {
                status: 'superseded',
                createdAt: '2026-09-03T01:00:00.000Z',
            }),
            snapshot(type, '2026-08', backtest('pass', 4), {
                createdAt: '2026-09-02T01:00:00.000Z',
            }),
            snapshot(type, '2026-07', backtest('insufficient', 3)),
        ]);

        const result = await service.forecastBacktest(DOMAIN, 2);

        expect(result.months).toBe(2);
        expect(result.items.map(item => [item.monthKey, item.status])).toEqual([
            ['2026-08', 'pass'],
            ['2026-07', 'insufficient'],
        ]);
        expect(result.items[0]).toMatchObject({
            shadowMonths: 4,
            shadowMinMonths: 9,
            months: 2,
            days: 40,
            coverageShare: 0.8,
            coverageCi90: [0.68, 0.88],
            coverageTarget: 0.8,
            maseNaive: 0.7,
            maseNaiveCi90: [0.5, 0.9],
            maseMean3: null,
            maseMean3Ci90: null,
            maseMax: 1,
            pinballMean: 1.5,
        });
    });

    it('история глубже окна стора (24 месяца) — окно created_at расширяется, а не обрезает её', async () => {
        const { service, aiService } = makeService([]);
        const now = new Date('2026-09-29T00:00:00.000Z');

        await service.forecastBacktest(DOMAIN, 24, now);

        const [, , from] = aiService.findByDomainTypesInPeriod.mock
            .calls[0] as [string, string[], Date, Date];
        const days = (now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
        expect(days).toBe(25 * 31);
    });

    it('битая вложенная форма (нет полей бэктеста) — запись пропускается, ручка не падает', async () => {
        const type = AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest;
        const { service } = makeService([
            snapshot(type, '2026-08', {
                ...backtest('pass', 9),
                backtest: { status: 'pass' },
            }),
            snapshot(type, '2026-07', backtest('insufficient', 3)),
        ]);

        const result = await service.forecastBacktest(DOMAIN);

        expect(result.items.map(item => item.monthKey)).toEqual(['2026-07']);
    });

    it('проверка без журналов с фактом — числа null, счётчики 0', async () => {
        const { service } = makeService([
            snapshot(AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest, '2026-08', {
                ...backtest('insufficient', 0),
                backtest: null,
            }),
        ]);
        const [item] = (await service.forecastBacktest(DOMAIN)).items;
        expect(item).toMatchObject({
            months: 0,
            days: 0,
            coverageShare: null,
            coverageCi90: null,
            maseNaive: null,
            pinballMean: null,
        });
    });
});

describe('AiAnalyticsPhase4StatusService — эффект советов и связь качества', () => {
    it('эффект: доли с интервалами, «до/после» по окнам, гейт и контроль подгонки', async () => {
        const share = { value: 0.55, ci90: [0.38, 0.71], n: 24 };
        const { service } = makeService([
            snapshot(
                AI_ANALYTICS_SNAPSHOT_TYPE.recommendationEffect,
                '2026-09',
                {
                    monthKey: '2026-09',
                    issuedMonths: ['2026-06', '2026-07'],
                    issued: 24,
                    completedWindows: 20,
                    done: 13,
                    disagree: 2,
                    doneShare: share,
                    disagreeShare: { value: null, ci90: null, n: 4 },
                    byLever: [
                        {
                            lever: 'volume',
                            issued: 24,
                            completedWindows: 20,
                            done: 13,
                            disagree: 2,
                            doneShare: share,
                            disagreeShare: share,
                            beforeAfter: [],
                        },
                    ],
                    beforeAfter: [
                        {
                            edge: 'presentation_to_offer',
                            before: { s: 30, n: 90 },
                            after: { s: 36, n: 88 },
                            diff: 0.08,
                            ci90: [-0.05, 0.2],
                            n: 12,
                        },
                    ],
                    gate: { status: 'fail', reasons: ['no-positive-edge'] },
                    params: {},
                    goodhart: { flags: 1, managersWithFlags: 1 },
                    meta: META,
                },
            ),
        ]);

        const { latest } = await service.recommendationEffect(DOMAIN);

        expect(latest).toMatchObject({
            monthKey: '2026-09',
            issued: 24,
            done: 13,
            doneShare: share,
            disagreeShare: { value: null, ci90: null, n: 4 },
            gateStatus: 'fail',
            gateReasons: ['no-positive-edge'],
            goodhartFlags: 1,
            goodhartManagers: 1,
        });
        expect(latest?.byLever).toEqual([
            {
                lever: 'volume',
                issued: 24,
                completedWindows: 20,
                done: 13,
                disagree: 2,
                doneShare: share,
            },
        ]);
        expect(latest?.beforeAfter).toEqual([
            {
                edge: 'presentation_to_offer',
                beforeS: 30,
                beforeN: 90,
                afterS: 36,
                afterN: 88,
                diff: 0.08,
                ci90: [-0.05, 0.2],
                windows: 12,
            },
        ]);
    });

    it('связь качества: оценки β, калибровка, плацебо и гейт', async () => {
        const estimate = { value: 0.21, se: 0.06, ci90: [0.11, 0.31] };
        const { service } = makeService([
            snapshot(AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink, '2026-09', {
                monthKey: '2026-09',
                status: 'estimated',
                reasons: ['se-above-target'],
                sample: {
                    n: 412,
                    events: 96,
                    managers: 7,
                    windowDays: 14,
                    dropped: {},
                    fromMonth: '2025-10',
                    toMonth: '2026-09',
                },
                within: estimate,
                between: null,
                pooled: estimate,
                form: null,
                epv: 12.5,
                reliability: {
                    r: 0.62,
                    rBetween: 0.8,
                    within: null,
                    between: null,
                    pooled: null,
                },
                calibration: {
                    slope: {
                        slope: 0.95,
                        se: 0.1,
                        ci90: [0.8, 1.1],
                        coversOne: true,
                        n: 412,
                    },
                    bins: [],
                },
                placebo: { lead: estimate, passed: true, n: 300 },
                gate: {
                    passedNow: false,
                    streak: 0,
                    months: 2,
                    published: false,
                    timestampLeakOk: true,
                },
                curve: [],
                sRef: null,
                pRef: null,
                countdown: null,
                meta: META,
            }),
        ]);

        const { latest } = await service.qualityLink(DOMAIN);

        expect(latest).toMatchObject({
            status: 'estimated',
            reasons: ['se-above-target'],
            sampleN: 412,
            sampleEvents: 96,
            sampleManagers: 7,
            windowDays: 14,
            within: { value: 0.21, ci90: [0.11, 0.31] },
            between: null,
            epv: 12.5,
            reliabilityR: 0.62,
            calibrationSlope: { value: 0.95, ci90: [0.8, 1.1] },
            calibrationCoversOne: true,
            placeboPassed: true,
            gatePassedNow: false,
            gateMonths: 2,
            published: false,
            timestampLeakOk: true,
        });
    });

    it('снапшотов нет — latest = null у эффекта и связи качества', async () => {
        const { service } = makeService([]);
        expect((await service.recommendationEffect(DOMAIN)).latest).toBeNull();
        expect((await service.qualityLink(DOMAIN)).latest).toBeNull();
    });
});
