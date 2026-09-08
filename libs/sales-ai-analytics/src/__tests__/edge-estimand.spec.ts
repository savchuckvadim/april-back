import {
    AI_EDGE_ESTIMANDS,
    AI_EDGE_ESTIMAND_PARAM_CODES,
    EDGE_ESTIMAND_DEFAULTS,
    edgeInvariant,
    resolveEdgeEstimand,
} from '../model/edge-estimand';
import { findParam } from '../params/registry.const';

describe('resolveEdgeEstimand: гистерезис доли сцепки', () => {
    it('79 % не переключает портал на вероятности', () => {
        expect(
            resolveEdgeEstimand({ chainSharePct: 79, current: 'rate' }),
        ).toMatchObject({
            estimand: 'rate',
            switched: false,
            reason: 'chain-below-enter',
        });
    });

    it('80 % переключает на вероятности', () => {
        expect(
            resolveEdgeEstimand({ chainSharePct: 80, current: 'rate' }),
        ).toMatchObject({
            estimand: 'prob',
            switched: true,
            reason: 'chain-entered',
            paramCode: AI_EDGE_ESTIMAND_PARAM_CODES.prob,
        });
    });

    it('75 % не откатывает обратно на интенсивности', () => {
        expect(
            resolveEdgeEstimand({ chainSharePct: 75, current: 'prob' }),
        ).toMatchObject({
            estimand: 'prob',
            switched: false,
            reason: 'chain-hold',
        });
    });

    it('69 % откатывает на интенсивности', () => {
        expect(
            resolveEdgeEstimand({ chainSharePct: 69, current: 'prob' }),
        ).toMatchObject({
            estimand: 'rate',
            switched: true,
            reason: 'chain-exited',
            paramCode: AI_EDGE_ESTIMAND_PARAM_CODES.rate,
        });
    });

    it('ровно на пороге выхода режим удерживается', () => {
        expect(
            resolveEdgeEstimand({ chainSharePct: 70, current: 'prob' })
                .estimand,
        ).toBe('prob');
    });

    it('без текущего режима портал считается на интенсивностях', () => {
        expect(resolveEdgeEstimand({ chainSharePct: 10 })).toMatchObject({
            estimand: EDGE_ESTIMAND_DEFAULTS.estimand,
            switched: false,
            enterPct: EDGE_ESTIMAND_DEFAULTS.enterPct,
            exitPct: EDGE_ESTIMAND_DEFAULTS.exitPct,
        });
    });

    it('пороги можно задать параметром, выход не выше входа', () => {
        expect(
            resolveEdgeEstimand({
                chainSharePct: 66,
                current: 'rate',
                enterPct: 65,
                exitPct: 90,
            }),
        ).toMatchObject({ estimand: 'prob', enterPct: 65, exitPct: 65 });
    });

    it('нечисловая доля сцепки считается нулевой', () => {
        expect(
            resolveEdgeEstimand({
                chainSharePct: Number.NaN,
                current: 'prob',
            }),
        ).toMatchObject({ estimand: 'rate', chainSharePct: 0 });
    });

    it('дефолты гистерезиса совпадают с кодами реестра', () => {
        expect(findParam('deal_chain_min_pct')?.defaultValue).toBe(
            EDGE_ESTIMAND_DEFAULTS.enterPct,
        );
        expect(findParam('deal_chain_exit_pct')?.defaultValue).toBe(
            EDGE_ESTIMAND_DEFAULTS.exitPct,
        );
    });

    it.each(AI_EDGE_ESTIMANDS)(
        'трактовка %s ссылается на существующий код реестра',
        estimand => {
            const code = AI_EDGE_ESTIMAND_PARAM_CODES[estimand];
            expect(findParam(code)?.estimand).toBe(estimand);
        },
    );
});

describe('edgeInvariant: числитель и знаменатель из одного источника', () => {
    it('числитель больше знаменателя при вероятностной трактовке даёт mixed-sources', () => {
        expect(edgeInvariant(12, 10, 'prob')).toEqual({
            ok: false,
            reason: 'mixed-sources',
            estimand: 'prob',
        });
    });

    it('для интенсивности s > n законно', () => {
        expect(edgeInvariant(120, 100, 'rate')).toEqual({
            ok: true,
            estimand: 'rate',
        });
    });

    it('s = n на вероятности проходит инвариант', () => {
        expect(edgeInvariant(10, 10, 'prob').ok).toBe(true);
    });

    it('отрицательные числа не проходят инвариант', () => {
        expect(edgeInvariant(-1, 10, 'prob')).toMatchObject({
            ok: false,
            reason: 'negative',
        });
    });

    it('нечисловые входы не проходят инвариант', () => {
        expect(edgeInvariant(Number.NaN, 10, 'prob')).toMatchObject({
            ok: false,
            reason: 'not-finite',
        });
        expect(
            edgeInvariant(1, Number.POSITIVE_INFINITY, 'rate'),
        ).toMatchObject({ ok: false, reason: 'not-finite' });
    });

    it('пустой знаменатель — не нарушение инварианта, а отсутствие данных', () => {
        expect(edgeInvariant(0, 0, 'prob')).toEqual({
            ok: true,
            estimand: 'prob',
        });
    });
});
