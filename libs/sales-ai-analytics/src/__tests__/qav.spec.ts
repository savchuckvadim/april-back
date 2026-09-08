import type { QualityPoint } from '../contracts/quality-link.types';
import {
    QAV_DEFAULTS,
    buildQualityLink,
    isoLine,
    probabilityAt,
    qualityMultiplier,
    requiredQualityFor,
    requiredVolumeWithQuality,
} from '../model/qav';

/**
 * Иллюстрация плана §4.4: `p̂(7) = 0,45`, `p̂(5) = 0,36`, `p̂(8,5) = 0,52`.
 * Множитель берётся из вероятностей, а не из наклона β.
 */
const CURVE: readonly QualityPoint[] = [
    { s: 5, p: 0.36 },
    { s: 7, p: 0.45 },
    { s: 8.5, p: 0.52 },
];

const dataLink = () =>
    buildQualityLink({ betaSource: 'data', sRef: 7, curve: CURVE });

describe('qualityMultiplier — шкала вероятности', () => {
    it('r(S) = p̂(S)/p̂(S_ref): 0,80 при S = 5 и 1,16 при S = 8,5', () => {
        const link = dataLink();
        expect(link.pRef).toBeCloseTo(0.45, 10);
        expect(qualityMultiplier(link, 5).value).toBeCloseTo(0.8, 10);
        expect(qualityMultiplier(link, 8.5).value).toBeCloseTo(1.16, 2);
        expect(qualityMultiplier(link, 8.5).scale).toBe('probability');
    });

    it('предупреждение: на шкале odds та же кривая завышает множитель', () => {
        // Плановая иллюстрация: «на шкале odds было бы ≈ 1,4» против 1,16.
        // Отношение шансов по тем же точкам даёт 1,32 — тоже далеко от 1,16,
        // поэтому множитель берётся из p̂, а не из β.
        const odds = (p: number) => p / (1 - p);
        const oddsRatio = odds(0.52) / odds(0.45);
        const link = dataLink();
        expect(oddsRatio).toBeGreaterThan(1.3);
        expect(oddsRatio / qualityMultiplier(link, 8.5).value).toBeGreaterThan(
            1.1,
        );
    });

    it('интерполяция на шкале логита монотонна и точна в узлах', () => {
        const link = dataLink();
        expect(probabilityAt(link, 7)).toBeCloseTo(0.45, 10);
        const middle = probabilityAt(link, 6) as number;
        expect(middle).toBeGreaterThan(0.36);
        expect(middle).toBeLessThan(0.45);
        expect(probabilityAt(link, 12)).toBeCloseTo(0.52, 10);
        expect(probabilityAt(link, 1)).toBeCloseTo(0.36, 10);
    });
});

describe('режимы none и hypothesis — связь не применяется', () => {
    it('none: множитель 1, applied false, изо-линия недоступна', () => {
        const link = buildQualityLink({ betaSource: 'none', curve: CURVE });
        expect(link.applied).toBe(false);
        expect(link.curve).toHaveLength(0);
        expect(link.reason).toBe('no-beta');
        const multiplier = qualityMultiplier(link, 5);
        expect(multiplier.value).toBe(1);
        expect(multiplier.applied).toBe(false);
        expect(multiplier.pAtScore).toBeNull();
        expect(isoLine(link, 45)(5)).toBeNull();
    });

    it('none: план по объёму от качества не зависит', () => {
        const link = buildQualityLink({ betaSource: 'none' });
        const plan = requiredVolumeWithQuality(link, 190, 4.8);
        expect(plan.volume).toBe(190);
        expect(plan.applied).toBe(false);
        expect(plan.multiplier).toBe(1);
    });

    it('hypothesis: β гипотезы не даёт множителя и не строит изо-линию', () => {
        const link = buildQualityLink({
            betaSource: 'hypothesis',
            hypothesisBeta: 0.17,
            curve: CURVE,
            beta: 0.19,
        });
        expect(link.hypothesisBeta).toBeCloseTo(0.17, 10);
        expect(link.beta).toBeNull();
        expect(link.curve).toHaveLength(0);
        expect(qualityMultiplier(link, 4.8)).toMatchObject({
            value: 1,
            applied: false,
        });
        expect(isoLine(link, 45)(4.8)).toBeNull();
        expect(requiredVolumeWithQuality(link, 190, 4.8).volume).toBe(190);
    });

    it('hypothesis: обратная задача не даёт числа', () => {
        const link = buildQualityLink({
            betaSource: 'hypothesis',
            hypothesisBeta: 0.17,
        });
        expect(requiredQualityFor(link, 100, 45)).toEqual({
            sReq: null,
            unreachable: false,
            reason: 'no-link',
        });
    });
});

describe('изо-линия и обратная задача (режим data)', () => {
    it('N·p̂(S) = const: при S = 5 нужно 1,25× объёма', () => {
        const line = isoLine(dataLink(), 45);
        expect(line(7)).toBeCloseTo(100, 8);
        expect(line(5)).toBeCloseTo(125, 8);
        expect((line(5) as number) / (line(7) as number)).toBeCloseTo(1.25, 8);
    });

    it('S_req: 45 исходов из 100 активностей достигаются при S = 7', () => {
        const result = requiredQualityFor(dataLink(), 100, 45);
        expect(result.sReq).toBeCloseTo(7, 6);
        expect(result.unreachable).toBe(false);
    });

    it('S_req выше s_req_max — цель качеством недостижима', () => {
        const link = dataLink();
        expect(requiredQualityFor(link, 100, 50, 8)).toEqual({
            sReq: null,
            unreachable: true,
            reason: 'above-s-req-max',
        });
        expect(requiredQualityFor(link, 100, 60).unreachable).toBe(true);
    });

    it('в режиме data объём делится на множитель качества', () => {
        const plan = requiredVolumeWithQuality(dataLink(), 100, 5);
        expect(plan.applied).toBe(true);
        expect(plan.multiplier).toBeCloseTo(0.8, 10);
        expect(plan.volume).toBeCloseTo(125, 8);
    });
});

describe('построение связи', () => {
    it('s_ref вне [1; 10] заменяется дефолтом 7', () => {
        expect(buildQualityLink({ betaSource: 'none', sRef: 42 }).sRef).toBe(
            QAV_DEFAULTS.sRef,
        );
        expect(buildQualityLink({ betaSource: 'none', sRef: 6 }).sRef).toBe(6);
    });

    it('битая кривая режима data не применяется', () => {
        const link = buildQualityLink({
            betaSource: 'data',
            curve: [
                { s: 5, p: 1.4 },
                { s: 7, p: 0.45 },
            ],
        });
        expect(link.applied).toBe(false);
        expect(link.reason).toBe('curve-invalid');
        expect(qualityMultiplier(link, 5).value).toBe(1);
    });

    it('экспонента exp(β·ΔS) — только для редкого исхода и с флагом', () => {
        const link = buildQualityLink({
            betaSource: 'data',
            sRef: 7,
            beta: 0.19,
            rareOutcome: true,
        });
        expect(link.rareOutcomeOnly).toBe(true);
        const multiplier = qualityMultiplier(link, 8.5);
        expect(multiplier.scale).toBe('exp-beta');
        expect(multiplier.rareOutcomeOnly).toBe(true);
        expect(multiplier.value).toBeCloseTo(Math.exp(0.19 * 1.5), 10);
    });

    it('без кривой и без редкого исхода режим data не применяется', () => {
        const link = buildQualityLink({ betaSource: 'data', beta: 0.19 });
        expect(link.applied).toBe(false);
        expect(qualityMultiplier(link, 9).applied).toBe(false);
    });
});
