import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    type PbxDealSalesBaseStageCode,
    getSalesBaseStageOrder,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

import {
    AI_EPISODE_FAIL_STAGE_CODES,
    AI_EPISODE_SUCCESS_STAGE_CODE,
    type DealEpisode,
    type StageTransition,
    buildEpisodes,
} from '../model/episode';
import {
    STAGE_THETA_DEFAULTS,
    stageQuantileOf,
    saleLags,
    stageSlaFacts,
    stageTheta,
} from '../model/stage-theta';

const NOW = '2026-06-30T09:00:00+03:00';

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;

/** Норма полосы и сила усадки из иллюстрации плана §4.2. */
const PRIOR = { mu: 0.09, kappa: 30 };

const day = (number: number): string =>
    `2026-06-${String(number).padStart(2, '0')}T12:00:00+03:00`;

function semanticOf(code: PbxDealSalesBaseStageCode): 'P' | 'S' | 'F' {
    if (code === AI_EPISODE_SUCCESS_STAGE_CODE) {
        return 'S';
    }

    return AI_EPISODE_FAIL_STAGE_CODES.some(failCode => failCode === code)
        ? 'F'
        : 'P';
}

function transition(
    entityId: string,
    code: PbxDealSalesBaseStageCode,
    dayNumber: number,
): StageTransition {
    return {
        entityId,
        stageCode: code,
        order: getSalesBaseStageOrder(code),
        semantic: semanticOf(code),
        at: day(dayNumber),
    };
}

/** Сделка: заход на стадию и её исход (открытая — без второго перехода). */
function deal(
    entityId: string,
    stageCode: PbxDealSalesBaseStageCode,
    outcome: PbxDealSalesBaseStageCode | null,
    endDay = 5,
): StageTransition[] {
    const start = transition(entityId, stageCode, 1);

    return outcome === null
        ? [start]
        : [start, transition(entityId, outcome, endDay)];
}

/** Пачка одинаковых сделок с общим префиксом идентификатора. */
function deals(
    prefix: string,
    count: number,
    stageCode: PbxDealSalesBaseStageCode,
    outcome: PbxDealSalesBaseStageCode | null,
): StageTransition[] {
    return Array.from({ length: count }, (_, index) =>
        deal(`${prefix}${index}`, stageCode, outcome),
    ).flat();
}

describe('stageTheta: вероятность продажи из стадии', () => {
    /**
     * Презентация: 15 сделок с известным исходом (4 продажи, 11 отказов) и
     * 2 ещё открытые. Холодная: 5 с исходом (1 продажа) — вдвое меньше данных.
     */
    const episodes: DealEpisode[] = buildEpisodes(
        [
            ...deals('PS', 4, STAGE.presentation, STAGE.success),
            ...deals('PF', 11, STAGE.presentation, STAGE.fail),
            ...deals('PO', 2, STAGE.presentation, null),
            ...deals('CS', 1, STAGE.cold, STAGE.success),
            ...deals('CF', 4, STAGE.cold, STAGE.fail),
        ],
        { now: NOW },
    );
    const thetas = stageTheta(episodes, { prior: PRIOR });
    const byStage = Object.fromEntries(
        thetas.map(theta => [theta.stageCode, theta]),
    );

    it('стадии отсортированы по порядку лестницы', () => {
        expect(thetas.map(theta => theta.stageCode)).toEqual([
            STAGE.cold,
            STAGE.presentation,
        ]);
        expect(byStage[STAGE.presentation].order).toBe(
            getSalesBaseStageOrder(STAGE.presentation),
        );
    });

    it('Beta-биномиал с усадкой: 4/15 при μ = 0,09 и κ = 30 → 0,149 (w = 0,33)', () => {
        const theta = byStage[STAGE.presentation];
        expect(theta).toMatchObject({ s: 4, n: 15, censored: 2 });
        expect(theta.value).toBeCloseTo(6.7 / 45, 6);
        // План §1.5: диапазон 0,149…0,150 при μ = 0,09…0,092 (см. shrink.spec).
        expect(theta.value).toBeCloseTo(0.149, 3);
        expect(theta.w).toBeCloseTo(1 / 3, 6);
        expect(theta.prior).toEqual(PRIOR);
        expect(theta.ci90).not.toBeNull();
    });

    it('вес собственных данных растёт с числом наблюдений', () => {
        const cold = byStage[STAGE.cold];
        const presentation = byStage[STAGE.presentation];
        expect(cold).toMatchObject({ s: 1, n: 5 });
        expect(cold.w).toBeCloseTo(5 / 35, 6);
        expect(presentation.n).toBeGreaterThan(cold.n);
        expect(presentation.w).toBeGreaterThan(cold.w);
    });

    it('открытые сделки не попадают в знаменатель, а считаются отдельно', () => {
        const theta = byStage[STAGE.presentation];
        expect(theta.censored).toBe(2);
        expect(theta.n).toBe(15);
    });

    it('без данных стадия отдаёт норму слоя с нулевым весом', () => {
        const onlyOpen = buildEpisodes(deals('O', 3, STAGE.warm, null), {
            now: NOW,
        });
        const [theta] = stageTheta(onlyOpen, { prior: PRIOR });
        expect(theta).toMatchObject({ n: 0, s: 0, censored: 3, w: 0 });
        expect(theta.value).toBeCloseTo(PRIOR.mu, 12);
        // Интервал есть, но он целиком прайорный: собственных данных нет.
        expect(theta.ci90?.[0]).toBeLessThan(PRIOR.mu);
        expect(theta.ci90?.[1]).toBeGreaterThan(PRIOR.mu);
    });

    it('без нормы и без данных интервала нет', () => {
        const onlyOpen = buildEpisodes(deals('Z', 2, STAGE.warm, null), {
            now: NOW,
        });
        const [theta] = stageTheta(onlyOpen, {
            prior: { mu: 0, kappa: 0 },
        });
        expect(theta).toMatchObject({ n: 0, w: 0, value: 0, ci90: null });
    });

    it('норму можно задать отдельно на каждую стадию', () => {
        const [cold, presentation] = stageTheta(episodes, {
            prior: {
                [STAGE.cold]: { mu: 0.2, kappa: 10 },
                [STAGE.presentation]: PRIOR,
            },
        });
        expect(cold.prior).toEqual({ mu: 0.2, kappa: 10 });
        expect(cold.value).toBeCloseTo((1 + 2) / 15, 6);
        expect(presentation.prior).toEqual(PRIOR);
    });

    it('без явной нормы берётся дефолт κ = kappa_edge_late', () => {
        const [theta] = stageTheta(
            buildEpisodes(deals('X', 2, STAGE.warm, STAGE.success), {
                now: NOW,
            }),
        );
        expect(theta.prior).toEqual({
            mu: STAGE_THETA_DEFAULTS.mu,
            kappa: STAGE_THETA_DEFAULTS.kappa,
        });
        expect(theta.value).toBeCloseTo(2 / 32, 6);
    });

    it('повторный заход на ту же стадию не удваивает знаменатель', () => {
        const rollback = buildEpisodes(
            [
                transition('R1', STAGE.presentation, 1),
                transition('R1', STAGE.cold, 3),
                transition('R1', STAGE.presentation, 5),
                transition('R1', STAGE.success, 9),
            ],
            { now: NOW },
        );
        const presentation = stageTheta(rollback, { prior: PRIOR }).find(
            theta => theta.stageCode === STAGE.presentation,
        );
        expect(presentation).toMatchObject({ n: 1, s: 1 });
    });

    it('пустой вход даёт пустой результат', () => {
        expect(stageTheta([], { prior: PRIOR })).toEqual([]);
    });
});

describe('stageSlaFacts: факты сроков по стадиям', () => {
    /** Длительности стадии «тёплый»: 1, 2, 3, 4 и 5 дней. */
    const episodes = buildEpisodes(
        [1, 2, 3, 4, 5].flatMap(duration => [
            transition(`W${duration}`, STAGE.warm, 1),
            transition(`W${duration}`, STAGE.presentation, 1 + duration),
        ]),
        { now: NOW },
    );

    it('p25/p50/p90 совпадают с ручным расчётом фикстуры', () => {
        expect(stageSlaFacts(episodes)[STAGE.warm]).toEqual({
            p25: 2,
            p50: 3,
            p90: 4.6,
            n: 5,
        });
    });

    it('открытые эпизоды в факты сроков не входят', () => {
        const withOpen = buildEpisodes(
            [
                ...deals('W', 2, STAGE.refine, STAGE.success),
                ...deals('WO', 3, STAGE.refine, null),
            ],
            { now: NOW },
        );
        expect(stageSlaFacts(withOpen)[STAGE.refine].n).toBe(2);
    });

    it('стадия без закрытых эпизодов в фактах не появляется', () => {
        const onlyOpen = buildEpisodes(deals('N', 2, STAGE.new, null), {
            now: NOW,
        });
        expect(stageSlaFacts(onlyOpen)).toEqual({});
    });

    it('квантиль по линейной интерполяции порядковых статистик', () => {
        expect(stageQuantileOf([5, 1, 4, 2, 3], 0.25)).toBe(2);
        expect(stageQuantileOf([5, 1, 4, 2, 3], 0.5)).toBe(3);
        expect(stageQuantileOf([5, 1, 4, 2, 3], 0.9)).toBe(4.6);
        expect(stageQuantileOf([], 0.5)).toBe(0);
        expect(stageQuantileOf([7], 0.9)).toBe(7);
    });
});

describe('saleLags: лаги продаж под оценку F(d)', () => {
    const episodes = buildEpisodes(
        [
            transition('S1', STAGE.new, 1),
            transition('S1', STAGE.presentation, 3),
            transition('S1', STAGE.success, 13),
            ...deal('S2', STAGE.presentation, null),
        ],
        { now: NOW },
    );

    it('лаг считается от первого эпизода сделки', () => {
        expect(saleLags(episodes)).toEqual([
            {
                entityId: 'S1',
                episodeKey: 'S1#1',
                lagDays: 12,
                days: 12,
                censored: false,
            },
        ]);
    });

    it('стадию отсчёта можно задать параметром', () => {
        expect(
            saleLags(episodes, { fromStageCode: STAGE.presentation })[0],
        ).toMatchObject({ lagDays: 10, censored: false });
    });

    it('открытые сделки добавляются цензурированными точками по запросу', () => {
        const withOpen = saleLags(episodes, { includeOpen: true });
        expect(withOpen).toHaveLength(2);
        expect(withOpen[1]).toMatchObject({
            entityId: 'S2',
            censored: true,
            lagDays: 28.875,
        });
    });

    it('без флага открытые сделки в выборку не попадают', () => {
        expect(saleLags(episodes).map(fact => fact.entityId)).toEqual(['S1']);
    });
});
