import {
    BETA_COLUMN,
    BETA_FIT_DEFAULTS,
    epvEventsOf,
    fitBeta,
    selectBetaForm,
} from '../model/beta-fit';
import { assembleBetaSample } from '../model/beta-sample';
import type { BetaSampleSeed } from '../model/beta-sample.types';
import { mulberry32, seedOf } from '../model/prng';
import {
    DEFAULT_SYNTHETIC,
    syntheticBetaSample,
} from './beta-synthetic.fixture';

/**
 * Правило EPV и деградация при малых n (план §4.4 «правило усложнения»,
 * §4.11 «при n < n_min_none — ни одного числа»).
 */
const smallSample = (events: number, total: number, managers: number = 4) => {
    const random = mulberry32(seedOf('epv', events, total));
    const seeds: BetaSampleSeed[] = [];
    for (let i = 1; i <= total; i += 1) {
        seeds.push({
            callId: `c${String(i).padStart(4, '0')}`,
            managerId: `m${i % managers}`,
            entityId: `d${i}`,
            episodeKey: `d${i}#0`,
            at: `2026-01-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`,
            monthKey: '2026-01',
            stratum: i % 2 === 0 ? 'cold' : 'request',
            score: 4 + 4 * random(),
            scoreSource: 'form',
            callsInEpisode: i % 3,
            offset: 0,
            outcome: i <= events ? 1 : 0,
            daysToOutcome: null,
            sBarLead: null,
        });
    }

    return assembleBetaSample(seeds);
};

describe('selectBetaForm — цепочка форм по EPV', () => {
    it('события правила — меньшая из групп исходов', () => {
        expect(epvEventsOf(25, 250)).toBe(25);
        expect(epvEventsOf(230, 250)).toBe(20);
        expect(epvEventsOf(250, 250)).toBe(0);
        expect(epvEventsOf(0, 250)).toBe(0);
    });

    it('25 событий → α + β_w и α + β_pooled; дальше по цепочке', () => {
        const form = (events: number, spec: 'mundlak' | 'pooled') =>
            selectBetaForm({ events, strataCount: 2, spec }).form;
        expect(form(25, 'mundlak')).toBe('slope-only');
        expect(form(25, 'pooled')).toBe('single-intercept');
        expect(form(35, 'mundlak')).toBe('single-intercept');
        expect(form(35, 'pooled')).toBe('no-gamma');
        expect(form(40, 'mundlak')).toBe('no-gamma');
        expect(form(40, 'pooled')).toBe('full');
        expect(form(50, 'mundlak')).toBe('full');
        expect(form(19, 'mundlak')).toBe('insufficient');
    });

    it('неинформативные γ и β_b пропускают формы с ними', () => {
        expect(
            selectBetaForm({
                events: 50,
                strataCount: 2,
                spec: 'mundlak',
                gammaInformative: false,
            }).form,
        ).toBe('no-gamma');
        expect(
            selectBetaForm({
                events: 50,
                strataCount: 2,
                spec: 'mundlak',
                betweenInformative: false,
            }).form,
        ).toBe('slope-only');
        expect(
            selectBetaForm({
                events: 50,
                strataCount: 2,
                spec: 'pooled',
                betweenInformative: false,
            }).form,
        ).toBe('full');
    });
});

describe('fitBeta — деградация при малых n и вырожденных дизайнах', () => {
    it('25 событий: β_b и γ выпадают, β_w и β_pooled остаются', () => {
        const fit = fitBeta(smallSample(25, 250));
        expect(fit.form).toEqual({
            mundlak: 'slope-only',
            pooled: 'single-intercept',
        });
        expect(fit.within).not.toBeNull();
        expect(fit.pooled).not.toBeNull();
        expect(fit.between).toBeNull();
        expect(fit.gamma).toBeNull();
        expect(fit.epv).toBe(12.5);
        expect(
            fit.models.mundlak.coefficients[BETA_COLUMN.between],
        ).toBeUndefined();
        expect(fit.strataIntercepts.cold).toBe(fit.strataIntercepts.request);
    });

    it('12 событий: чисел наружу нет', () => {
        const fit = fitBeta(smallSample(12, 250));
        expect(fit.form).toEqual({
            mundlak: 'insufficient',
            pooled: 'insufficient',
        });
        expect(fit.within).toBeNull();
        expect(fit.between).toBeNull();
        expect(fit.pooled).toBeNull();
        expect(fit.gamma).toBeNull();
        expect(fit.epv).toBeNull();
        expect(fit.managerEffects).toEqual({});
    });

    it('доля исхода выше половины: EPV считается по не-событиям', () => {
        // 238 событий из 250 → меньшая группа 12 → insufficient.
        const fit = fitBeta(smallSample(238, 250));
        expect(fit.form.pooled).toBe('insufficient');
        expect(fit.pooled).toBeNull();
        // 225 из 250 → 25 не-событий → та же деградация, что при 25 событиях.
        expect(fitBeta(smallSample(225, 250)).form).toEqual({
            mundlak: 'slope-only',
            pooled: 'single-intercept',
        });
    });

    it('все исходы одинаковы (полное разделение) — модели нет', () => {
        expect(fitBeta(smallSample(250, 250)).pooled).toBeNull();
        expect(fitBeta(smallSample(0, 250)).pooled).toBeNull();
    });

    it('один менеджер: β_b неоцениваем, Мундлак вырождается до α + β_w', () => {
        const fit = fitBeta(smallSample(100, 250, 1));
        expect(fit.form.mundlak).toBe('slope-only');
        expect(fit.form.pooled).toBe('full');
        expect(fit.between).toBeNull();
        expect(fit.within).not.toBeNull();
        expect(fit.converged).toBe(true);
        expect(fit.reliability.rowsPerManager).toBe(250);
    });

    it('n < n_min_none — модель не строится даже при достаточных событиях', () => {
        const fit = fitBeta(smallSample(4, BETA_FIT_DEFAULTS.minN - 1), {
            minEpv: 1,
        });
        expect(fit.form.pooled).toBe('insufficient');
        expect(fit.pooled).toBeNull();
    });

    it('пустая выборка — insufficient без исключений', () => {
        const empty = syntheticBetaSample({
            ...DEFAULT_SYNTHETIC,
            managers: 0,
        }).sample;
        const fit = fitBeta(empty);
        expect(fit.form).toEqual({
            mundlak: 'insufficient',
            pooled: 'insufficient',
        });
        expect(fit.n).toBe(0);
        expect(fit.reliability.rowsPerManager).toBe(0);
    });
});
