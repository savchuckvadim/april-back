import {
    betaCurve,
    betaProbabilityAt,
    buildQualityLinkFromFit,
} from '../model/beta-curve';
import { type BetaEstimate, type BetaFit, fitBeta } from '../model/beta-fit';
import { qualityMultiplier } from '../model/qav';
import { probabilityOnCurve } from '../model/quality-curve';
import {
    DEFAULT_SYNTHETIC,
    expit,
    syntheticBetaSample,
} from './beta-synthetic.fixture';

describe('betaCurve / buildQualityLinkFromFit — кривая p̂(S) (план §4.4, §4.8)', () => {
    const { sample } = syntheticBetaSample(DEFAULT_SYNTHETIC);
    const fit = fitBeta(sample);
    const curve = betaCurve(fit);

    it('10 точек с шагом 1 и 19 с шагом 0,5; S возрастает, p ∈ (0; 1)', () => {
        expect(curve.map(point => point.s)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        ]);
        expect(betaCurve(fit, 0.5)).toHaveLength(19);
        expect(betaCurve(fit, 0.5)[1].s).toBe(1.5);
        curve.forEach(point => {
            expect(point.p).toBeGreaterThan(0);
            expect(point.p).toBeLessThan(1);
        });
    });

    it('при β > 0 кривая монотонно растёт', () => {
        for (let index = 1; index < curve.length; index += 1) {
            expect(curve[index].p).toBeGreaterThan(curve[index - 1].p);
        }
    });

    it('точка кривой — логит-модель при опорных ковариатах', () => {
        const model = fit.models.pooled;
        const beta = (fit.pooled as BetaEstimate).value;
        const gamma = model.coefficients.gamma;
        const shares = fit.reference.strataShares;
        const alpha =
            (model.strataIntercepts.cold as number) * (shares.cold as number) +
            (model.strataIntercepts.request as number) *
                (shares.request as number) +
            (model.strataIntercepts.lead as number) * (shares.lead as number);
        const eta =
            alpha +
            beta * (7 - fit.reference.sBarPortal) +
            gamma * Math.log(1 + fit.reference.medianCalls) +
            fit.reference.meanOffset;
        expect(betaProbabilityAt(fit, 7)).toBeCloseTo(expit(eta), 12);
        expect(betaProbabilityAt(fit, Number.NaN)).toBeNull();
    });

    it('связь режима data: применена, pRef по кривой, экспоненты нет', () => {
        const link = buildQualityLinkFromFit(fit, 7);
        expect(link.betaSource).toBe('data');
        expect(link.applied).toBe(true);
        expect(link.rareOutcomeOnly).toBe(false);
        expect(link.reason).toBeNull();
        expect(link.sRef).toBe(7);
        expect(link.curve).toEqual(curve);
        expect(link.pRef).toBeCloseTo(
            probabilityOnCurve(curve, 7) as number,
            12,
        );
        expect(link.beta).toBe((fit.pooled as BetaEstimate).value);
        const multiplier = qualityMultiplier(link, 8.5);
        expect(multiplier.applied).toBe(true);
        expect(multiplier.scale).toBe('probability');
        expect(multiplier.value).toBeGreaterThan(1);
    });

    it('без модели (insufficient) кривой нет и связь не применяется', () => {
        const tiny = syntheticBetaSample({
            ...DEFAULT_SYNTHETIC,
            managers: 2,
            perManager: 10,
        });
        const tinyFit = fitBeta(tiny.sample);
        expect(betaCurve(tinyFit)).toEqual([]);
        expect(betaProbabilityAt(tinyFit, 7)).toBeNull();
        const link = buildQualityLinkFromFit(tinyFit, 7);
        expect(link.applied).toBe(false);
        expect(link.reason).toBe('curve-invalid');
        expect(link.pRef).toBeNull();
    });

    it('несошедшаяся pooled-модель не даёт кривой (плоская кривая наружу не выходит)', () => {
        const broken: BetaFit = {
            ...fit,
            pooled: null,
            models: {
                ...fit.models,
                pooled: { ...fit.models.pooled, converged: false },
            },
        };
        expect(betaCurve(broken)).toEqual([]);
        expect(betaProbabilityAt(broken, 7)).toBeNull();
        expect(buildQualityLinkFromFit(broken, 7).applied).toBe(false);
    });

    it('детерминизм', () => {
        expect(betaCurve(fitBeta(sample))).toEqual(curve);
    });
});
