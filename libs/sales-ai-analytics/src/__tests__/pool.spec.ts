import { exponentialLagCdf, type LagCdf } from '../model/lag-cdf';
import {
    POOL_DEFAULTS,
    buildPool,
    isIsoDate,
    portalPoolReason,
} from '../model/pool';
import {
    AI_POOL_PORTAL_REASONS,
    AI_POOL_REASONS,
    type PoolModel,
    type PoolPortalInput,
} from '../model/pool.types';
import { mulberry32, sampleNormal, seedOf } from '../model/prng';
import { registryDefault } from '../params/registry.access';

/**
 * Сборка пула (план §4.4 «Пул», §4.11 «Ежеквартально», режим владельца
 * А.3): согласие и история как гейт, `insufficient` без чисел, β пула и
 * готовность E2, обезличенные ключи, детерминизм.
 */

const NOW = '2026-09-29';

const expWithN = (medianDays: number, n: number): LagCdf => ({
    ...exponentialLagCdf(medianDays),
    n,
});

/** Портал с полным набором оценок из синтетики по seed. */
const portalOf = (
    key: string,
    overrides: Partial<PoolPortalInput> = {},
): PoolPortalInput => {
    const random = mulberry32(seedOf('pool', key));
    const betaSe = 0.04 + 0.02 * random();

    return {
        portalKey: key,
        consentAt: '2026-01-15',
        historyMonths: 12,
        managers: 4 + Math.floor(random() * 4),
        edges: [
            {
                edge: 'e2',
                estimand: 'prob',
                mu: 0.4 + 0.1 * random(),
                kappa: 20 + 40 * random(),
                n: 100 + Math.floor(200 * random()),
            },
            {
                edge: 'e4',
                estimand: 'prob',
                mu: 0.1 + 0.05 * random(),
                kappa: 30,
                n: 20 + Math.floor(20 * random()),
            },
        ],
        beta: {
            value:
                0.3 +
                0.1 * sampleNormal(random) +
                betaSe * sampleNormal(random),
            se: betaSe,
            n: 30 + Math.floor(50 * random()),
        },
        lagCdf: expWithN(20 + 20 * random(), 40 + Math.floor(60 * random())),
        lognormal: { m: 10 + random(), v: 0.3 + 0.2 * random(), n: 50 },
        seasonIndex: Array.from({ length: 12 }, () => 0.8 + 0.4 * random()),
        ...overrides,
    };
};

const keysOf = (count: number): string[] =>
    Array.from({ length: count }, (_, index) => `hash-${index}`);

/** Результат без функции `at` (JSON её отбрасывает) — для сравнения toEqual. */
const comparable = (model: PoolModel): unknown =>
    JSON.parse(JSON.stringify(model));

describe('portalPoolReason / isIsoDate', () => {
    it('согласие обязано быть датировано и не позже now; история ≥ минимума', () => {
        expect(isIsoDate('2026-09-29')).toBe(true);
        expect(isIsoDate('29.09.2026')).toBe(false);
        expect(isIsoDate('2026-13-01')).toBe(false);
        expect(isIsoDate('2026-09-32')).toBe(false);
        expect(isIsoDate('')).toBe(false);
        const reasonOf = (overrides: Partial<PoolPortalInput>): string =>
            portalPoolReason({ ...portalOf('p'), ...overrides }, NOW, 6);
        const R = AI_POOL_PORTAL_REASONS;
        expect(reasonOf({})).toBe(R.included);
        expect(reasonOf({ consentAt: NOW })).toBe(R.included);
        expect(reasonOf({ consentAt: null })).toBe(R.noConsent);
        expect(reasonOf({ consentAt: 'вчера' })).toBe(R.noConsent);
        expect(reasonOf({ consentAt: '2026-09-30' })).toBe(R.consentNotYet);
        expect(reasonOf({ historyMonths: 5 })).toBe(R.shortHistory);
        expect(reasonOf({ historyMonths: Number.NaN })).toBe(R.shortHistory);
    });
});

describe('buildPool — гейты', () => {
    it('дефолты гейтов — из реестра; E2 требует pool_min_portals_beta отдельно', () => {
        expect(POOL_DEFAULTS.minPortals).toBe(
            registryDefault('pool_min_portals'),
        );
        expect(POOL_DEFAULTS.minHistoryMonths).toBe(
            registryDefault('pool_min_history_months'),
        );
        expect(POOL_DEFAULTS.minPortalsBeta).toBe(
            registryDefault('pool_min_portals'),
        );
        expect(POOL_DEFAULTS.minPortalsE2).toBe(
            registryDefault('pool_min_portals_beta'),
        );
        expect(POOL_DEFAULTS.minPortalsE2).toBeGreaterThan(
            POOL_DEFAULTS.minPortalsBeta,
        );
    });

    it('порталы без согласия, с будущим согласием и короткой историей исключены', () => {
        const model = buildPool({
            now: NOW,
            portals: [
                portalOf('ok-1'),
                portalOf('ok-2'),
                portalOf('ok-3'),
                portalOf('no-consent', { consentAt: null }),
                portalOf('future', { consentAt: '2027-01-01' }),
                portalOf('short', { historyMonths: 3 }),
            ],
        });
        expect(model.status).toBe('estimated');
        expect(model.eligible).toBe(3);
        expect(model.portals).toEqual([
            { portalKey: 'ok-1', included: true, reason: 'included' },
            { portalKey: 'ok-2', included: true, reason: 'included' },
            { portalKey: 'ok-3', included: true, reason: 'included' },
            { portalKey: 'no-consent', included: false, reason: 'no-consent' },
            { portalKey: 'future', included: false, reason: 'consent-not-yet' },
            { portalKey: 'short', included: false, reason: 'short-history' },
        ]);
    });

    it('меньше pool_min_portals пригодных → insufficient и ни одного числа', () => {
        const portals = [portalOf('ok-1'), portalOf('ok-2')];
        const model = buildPool({
            now: NOW,
            portals: [...portals, portalOf('none', { consentAt: null })],
        });
        expect(model.status).toBe('insufficient');
        expect(model.eligible).toBe(2);
        expect(model.reasons).toEqual([AI_POOL_REASONS.tooFewPortals]);
        expect(model.edges).toEqual([]);
        expect(
            model.beta ?? model.lagCdf ?? model.lognormal ?? model.seasonIndex,
        ).toBeNull();
        expect(model.evidence).toEqual({
            betaPortals: 0,
            minPortalsE2: POOL_DEFAULTS.minPortalsE2,
            ready: false,
        });
        expect(model.portals).toHaveLength(3);
        expect(buildPool({ now: NOW, portals: [] }).status).toBe(
            'insufficient',
        );
    });

    it('в результате только обезличенные ключи — ни одного поля с доменом', () => {
        const model = buildPool({
            now: NOW,
            portals: keysOf(3).map(k => portalOf(k)),
        });
        expect(JSON.stringify(comparable(model))).not.toMatch(/domain/i);
        for (const portal of model.portals) {
            expect(Object.keys(portal)).toEqual([
                'portalKey',
                'included',
                'reason',
            ]);
        }
    });
});

describe('buildPool — оценки при статусе estimated', () => {
    it('три портала: нормы рёбер с ≥ minPortals порталов, β гибрид, E2 не готов', () => {
        const model = buildPool({
            now: NOW,
            portals: [
                ...keysOf(3).map(k => portalOf(k)),
                portalOf('e5-only', {
                    edges: [{ ...portalOf('x').edges[0], edge: 'e5' }],
                }),
            ],
        });
        expect(model.status).toBe('estimated');
        expect(model.eligible).toBe(4);
        // e5 есть только у одного портала — в пул норм не выходит.
        expect(model.edges.map(edge => edge.edge)).toEqual(['e2', 'e4']);
        model.edges.forEach(edge => {
            expect(edge.portals).toBe(3);
            expect(edge.tau0).not.toBeNull();
            expect(edge.mu0).toBeGreaterThan(0);
            expect(edge.mu0).toBeLessThan(1);
        });
        expect(model.beta?.portals).toBe(4);
        expect(model.beta?.label).toBe('hybrid');
        expect(model.evidence).toEqual({
            betaPortals: 4,
            minPortalsE2: POOL_DEFAULTS.minPortalsE2,
            ready: false,
        });
        expect(model.lagCdf?.kind).toBe('table');
        expect(model.lognormal?.n).toBe(200);
        expect(model.seasonIndex).toHaveLength(12);
        expect(model.reasons).toEqual([]);
    });

    it('восемь порталов с β: τ² оценён, метка estimated, E2 готов', () => {
        const model = buildPool({
            now: NOW,
            portals: keysOf(8).map(k => portalOf(k)),
        });
        expect(model.beta?.label).toBe('estimated');
        expect(model.beta?.tau2Source).toBe('estimated');
        expect(model.beta?.tau2).toBeGreaterThanOrEqual(0);
        expect(model.beta?.betaPool).toBeCloseTo(0.3, 0);
        expect(model.evidence.ready).toBe(true);
        expect(model.evidence.betaPortals).toBe(8);
    });

    it('β пула не считается, пока порталов с β меньше minPortalsBeta; причины накапливаются', () => {
        const model = buildPool({
            now: NOW,
            portals: [
                portalOf('a', { beta: null, lagCdf: null, lognormal: null }),
                portalOf('b', { beta: null, lagCdf: null, seasonIndex: null }),
                portalOf('c', { lagCdf: null, lognormal: null }),
            ],
        });
        expect(model.status).toBe('estimated');
        expect(model.beta).toBeNull();
        expect(model.lagCdf).toBeNull();
        // Чек есть только у портала b — наружу его не выносим (обезличенность).
        expect(model.lognormal).toBeNull();
        expect(model.seasonIndex).toBeNull();
        expect(model.reasons).toEqual([
            AI_POOL_REASONS.tooFewPortalsBeta,
            AI_POOL_REASONS.noLagData,
            AI_POOL_REASONS.noLognormalData,
            AI_POOL_REASONS.seasonNotEstimated,
        ]);
        expect(model.evidence.betaPortals).toBe(1);
    });

    it('переопределения params; E2 не готов без β пула; now обязан быть датой', () => {
        const model = buildPool({
            now: NOW,
            portals: [portalOf('a', { historyMonths: 4 }), portalOf('b')],
            params: { minPortals: 2, minHistoryMonths: 4, minPortalsBeta: 2 },
        });
        expect([model.status, model.eligible, model.beta?.portals]).toEqual([
            'estimated',
            2,
            2,
        ]);
        // Восемь порталов с β, но β пула не оценена — E2 не готов.
        const strict = buildPool({
            now: NOW,
            portals: keysOf(8).map(k => portalOf(k)),
            params: { minPortalsBeta: 9 },
        });
        expect(strict.beta).toBeNull();
        expect(strict.reasons).toContain(AI_POOL_REASONS.tooFewPortalsBeta);
        expect(strict.evidence).toEqual({
            betaPortals: 8,
            minPortalsE2: POOL_DEFAULTS.minPortalsE2,
            ready: false,
        });
        expect(() => buildPool({ now: '29.09.2026', portals: [] })).toThrow(
            /YYYY-MM-DD/,
        );
    });

    it('таблица лага и чек одного портала из трёх не попадают в пул', () => {
        const model = buildPool({
            now: NOW,
            portals: [
                portalOf('a', { lagCdf: null, lognormal: null }),
                portalOf('b'),
                portalOf('c', { lagCdf: null, lognormal: null }),
            ],
        });
        expect(model.status).toBe('estimated');
        expect(model.lagCdf).toBeNull();
        expect(model.lognormal).toBeNull();
        expect(model.reasons).toContain(AI_POOL_REASONS.noLagData);
        expect(model.reasons).toContain(AI_POOL_REASONS.noLognormalData);
    });

    it('два портала с данными при pool_min_portals = 3 — лаг и чек не выходят', () => {
        const portals = [
            portalOf('a'),
            portalOf('b'),
            portalOf('c', { lagCdf: null, lognormal: null }),
        ];
        const model = buildPool({
            now: NOW,
            portals,
            params: { minPortals: 3 },
        });
        expect(model.status).toBe('estimated');
        expect(model.lagCdf).toBeNull();
        expect(model.lognormal).toBeNull();
        // При minPortals = 2 те же два портала дают оценку.
        const relaxed = buildPool({
            now: NOW,
            portals,
            params: { minPortals: 2 },
        });
        expect(relaxed.lagCdf?.kind).toBe('table');
        expect(relaxed.lognormal?.n).toBe(100);
    });

    it('детерминизм: два вызова → одинаковый результат, seed воспроизводим', () => {
        const portals = keysOf(5).map(k => portalOf(k));
        const first = buildPool({ now: NOW, portals });
        const second = buildPool({ now: NOW, portals });
        expect(comparable(first)).toEqual(comparable(second));
        for (let day = 0; day <= 60; day += 1) {
            expect(first.lagCdf?.at(day)).toBe(second.lagCdf?.at(day));
        }
        // Синтетика воспроизводима по seed (функция `at` в JSON не попадает).
        expect(JSON.stringify(keysOf(5).map(k => portalOf(k)))).toBe(
            JSON.stringify(portals),
        );
        expect(first.now).toBe(NOW);
    });
});
