import {
    consentDateOf,
    consentInForce,
    isPoolParticipant,
    poolBetaOf,
    poolEdgesOf,
    poolLagCdfOf,
    poolLognormalOf,
    poolPortalInputOf,
    poolSeasonIndexOf,
    recordUpTo,
} from '../domain/loaders/pool-portals.facts';
import {
    poolModelPayload,
    qualityLinkPayload,
    snapshotRecord as record,
} from './fixtures/pool.fixture';

/**
 * Чистый разбор входов пула (Фаза 4, П17): участие и дата согласия, запись
 * месяца не позже расчётного, модель портала и оценка связи качества
 * структурно — чужая форма деградирует до «нет данных».
 */

describe('участие и дата согласия', () => {
    it('участник — флаг и дата вместе', () => {
        expect(
            isPoolParticipant({ poolOptIn: true, poolConsentAt: '2026-01-01' }),
        ).toBe(true);
        expect(
            isPoolParticipant({ poolOptIn: true, poolConsentAt: null }),
        ).toBe(false);
        expect(
            isPoolParticipant({
                poolOptIn: false,
                poolConsentAt: '2026-01-01',
            }),
        ).toBe(false);
    });

    it('дата согласия обрезается до дня; мусор — «согласия нет»', () => {
        expect(consentDateOf('2026-05-10T12:00:00+03:00')).toBe('2026-05-10');
        expect(consentDateOf(' 2026-05-10 ')).toBe('2026-05-10');
        expect(consentDateOf('вчера')).toBeNull();
        expect(consentDateOf(null)).toBeNull();
    });

    it('согласие в силе — флаг, дата и дата не позже дня прогона', () => {
        const day = '2026-10-03';
        const on = (poolConsentAt: string | null, poolOptIn = true) =>
            consentInForce({ poolOptIn, poolConsentAt }, day);
        expect(on('2026-10-03T09:00:00+03:00')).toBe(true);
        expect(on('2026-10-04')).toBe(false);
        expect(on('вчера')).toBe(false);
        expect(on(null)).toBe(false);
        expect(on('2026-01-01', false)).toBe(false);
    });
});

describe('recordUpTo — запись месяца для пула', () => {
    it('самый поздний месяц не позже расчётного; нет такого — null', () => {
        const records = [record('2026-09', 1), record('2026-08', 2)];
        expect(recordUpTo(records, '2026-09')?.payload).toBe(1);
        expect(recordUpTo(records, '2026-12')?.payload).toBe(1);
        expect(recordUpTo(records, '2026-08')?.payload).toBe(2);
        expect(recordUpTo(records, '2026-07')).toBeNull();
        expect(recordUpTo([], '2026-09')).toBeNull();
    });
});

describe('разбор модели портала', () => {
    it('рёбра витрины → канон, трактовка портала; ребро вне канона отброшено', () => {
        expect(poolEdgesOf(poolModelPayload())).toEqual([
            { edge: 'e1', estimand: 'prob', mu: 0.05, kappa: 30, n: 2000 },
            { edge: 'e2', estimand: 'prob', mu: 0.45, kappa: 12, n: 300 },
        ]);
        expect(
            poolEdgesOf(poolModelPayload({ edgeKind: 'rate' }))[0].estimand,
        ).toBe('rate');
    });

    it('трактовка рёбер неизвестна — рёбер нет (доли и интенсивности не смешиваются)', () => {
        expect(poolEdgesOf(poolModelPayload({ edgeKind: 'чужое' }))).toEqual(
            [],
        );
        expect(poolEdgesOf(poolModelPayload({ edgeKind: undefined }))).toEqual(
            [],
        );
    });

    it('таблица лага восстанавливается с F(d); без продаж — null', () => {
        const cdf = poolLagCdfOf(poolModelPayload().lagCdf);
        expect(cdf?.n).toBe(40);
        expect(cdf?.kind).toBe('kaplan-meier');
        expect(cdf?.at(30)).toBeCloseTo(1, 10);
        expect(
            poolLagCdfOf({
                kind: 'exponential',
                n: 0,
                points: [{ days: 1, value: 0.1 }],
            }),
        ).toBeNull();
        expect(poolLagCdfOf({ kind: 'чужой', n: 5, points: [] })).toBeNull();
    });

    it('чек и сезон — только собственная оценка портала', () => {
        expect(poolLognormalOf(poolModelPayload())).toEqual({
            m: 11,
            v: 0.4,
            n: 40,
        });
        expect(
            poolLognormalOf(
                poolModelPayload({
                    checkLognormal: { m: 11, v: 0.4, n: 0, source: 'default' },
                }),
            ),
        ).toBeNull();
        expect(poolSeasonIndexOf(poolModelPayload())).toHaveLength(12);
        expect(
            poolSeasonIndexOf(
                poolModelPayload({ season: { index: 1, source: 'default' } }),
            ),
        ).toBeNull();
        expect(
            poolSeasonIndexOf(
                poolModelPayload({
                    season: { index: [1, 1, 1], source: 'estimated' },
                }),
            ),
        ).toBeNull();
    });

    it('чек и сезон новой модели — собственная несжатая оценка own', () => {
        const own = { m: 10.5, v: 0.6, n: 30 };
        const series = [1, 1, 1.1, 1, 0.9, 1, 1, 0.8, 1.1, 1, 1, 1.1];
        const payload = poolModelPayload({
            checkLognormal: {
                m: 10.2,
                v: 0.8,
                n: 30,
                w: 0.6,
                source: 'shrunk',
                priorFromPool: false,
                own,
            },
            seasonIndex: {
                index: series.map(() => 1),
                source: 'shrunk',
                monthsUsed: 36,
                yearsUsed: 3,
                own: series,
            },
        });

        expect(poolLognormalOf(payload)).toEqual(own);
        expect(poolSeasonIndexOf(payload)).toEqual(series);
    });

    it('own = null — своей оценки нет, дефолт реестра в пул не идёт', () => {
        const payload = poolModelPayload({
            checkLognormal: {
                m: 9.7,
                v: 1,
                n: 5,
                w: 0,
                source: 'default',
                priorFromPool: false,
                own: null,
            },
            seasonIndex: {
                index: Array.from({ length: 12 }, () => 1),
                source: 'pooled',
                monthsUsed: 12,
                yearsUsed: 1,
                own: null,
            },
        });

        expect(poolLognormalOf(payload)).toBeNull();
        expect(poolSeasonIndexOf(payload)).toBeNull();
    });

    it('β портала — из оценки связи качества с SE; без оценки — null', () => {
        expect(poolBetaOf(qualityLinkPayload('published'))).toEqual({
            value: 0.3,
            se: 0.08,
            n: 240,
        });
        expect(poolBetaOf(qualityLinkPayload('estimated'))).not.toBeNull();
        expect(poolBetaOf(qualityLinkPayload('insufficient'))).toBeNull();
        expect(poolBetaOf(qualityLinkPayload('estimated', null))).toBeNull();
        expect(poolBetaOf(null)).toBeNull();
    });

    it('модели ещё нет — вход с нулевой историей (пул отметит короткую историю)', () => {
        expect(
            poolPortalInputOf({
                portalKey: 'k',
                consentAt: '2026-01-01',
                model: null,
                qualityLink: null,
            }),
        ).toEqual({
            portalKey: 'k',
            consentAt: '2026-01-01',
            historyMonths: 0,
            managers: 0,
            edges: [],
            beta: null,
            lagCdf: null,
            lognormal: null,
            seasonIndex: null,
        });
    });

    it('история — глубина из готовности модели, а не длина окна (там всегда 12)', () => {
        const input = poolPortalInputOf({
            portalKey: 'k',
            consentAt: '2026-01-01',
            model: poolModelPayload(),
            qualityLink: qualityLinkPayload('estimated'),
        });
        expect(poolModelPayload().window).toHaveLength(12);
        expect(input.historyMonths).toBe(9);
        expect(input.managers).toBe(6);
        const legacy = poolPortalInputOf({
            portalKey: 'k',
            consentAt: '2026-01-01',
            model: poolModelPayload({ readiness: undefined }),
            qualityLink: null,
        });
        expect(legacy.historyMonths).toBe(0);
    });
});
