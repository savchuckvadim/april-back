import {
    AI_TARGET_FLAGS,
    AI_TARGET_SOURCES,
    resolveTarget,
    targetSanity,
} from '../model/target';

/**
 * Каскад цели месяца и её санити-проверки (план §4.9; Фаза 2, поток
 * `p2-model-forecast-plan`).
 */

describe('resolveTarget — каскад цели', () => {
    const full = {
        planHead: 4,
        override: 5,
        levelTarget: 6,
        bandMedian: 7,
    };

    it('план руководителя старше всех ступеней', () => {
        expect(resolveTarget(full)).toEqual({
            value: 4,
            source: 'plan',
            fromOverride: false,
            empty: false,
        });
    });

    it('без плана берётся переопределение менеджера', () => {
        const result = resolveTarget({ ...full, planHead: null });
        expect(result.value).toBe(5);
        expect(result.source).toBe('plan');
        expect(result.fromOverride).toBe(true);
    });

    it('дальше — цель уровня, затем медиана полосы', () => {
        expect(
            resolveTarget({ ...full, planHead: null, override: null }),
        ).toEqual({
            value: 6,
            source: 'levelTarget',
            fromOverride: false,
            empty: false,
        });
        expect(resolveTarget({ bandMedian: 7 })).toEqual({
            value: 7,
            source: 'median',
            fromOverride: false,
            empty: false,
        });
    });

    it('пустой каскад — ноль с признаком «цель не задана»', () => {
        const result = resolveTarget({});
        expect(result.value).toBe(0);
        expect(result.empty).toBe(true);
    });

    it('ноль на ступени — валидная цель, а не пустая ступень', () => {
        const result = resolveTarget({ planHead: 0, bandMedian: 7 });
        expect(result.value).toBe(0);
        expect(result.empty).toBe(false);
        expect(result.source).toBe('plan');
    });

    it('нечисловые и отрицательные ступени пропускаются', () => {
        expect(
            resolveTarget({
                planHead: Number.NaN,
                override: -1,
                levelTarget: 6,
            }).source,
        ).toBe('levelTarget');
    });

    it('union источника совпадает с DTO плана дня', () => {
        expect(AI_TARGET_SOURCES).toEqual(['plan', 'levelTarget', 'median']);
    });
});

describe('targetSanity', () => {
    it('цель ниже медианы факта полосы — «план = пожелание»', () => {
        const result = targetSanity({
            target: 2,
            bandFactMedian: 3,
            cap: 0.5,
            workdays: 20,
        });
        expect(result.flags).toEqual(['wish']);
    });

    it('цель выше cap × D — недостижима объёмом', () => {
        const result = targetSanity({
            target: 10,
            bandFactMedian: 3,
            cap: 0.2,
            workdays: 20,
        });
        expect(result.maxByCapacity).toBeCloseTo(4, 10);
        expect(result.flags).toEqual(['unreachable-by-volume']);
    });

    it('здоровая цель не даёт флагов', () => {
        expect(
            targetSanity({
                target: 3,
                bandFactMedian: 3,
                cap: 0.5,
                workdays: 20,
            }).flags,
        ).toEqual([]);
    });

    it('без оценок полосы и capacity флагов нет, потолок null', () => {
        const result = targetSanity({ target: 3, workdays: 20 });
        expect(result.flags).toEqual([]);
        expect(result.maxByCapacity).toBeNull();
    });

    it('оба флага возможны одновременно при нездоровых данных полосы', () => {
        const result = targetSanity({
            target: 5,
            bandFactMedian: 8,
            cap: 0.1,
            workdays: 20,
        });
        expect(result.flags).toEqual([...AI_TARGET_FLAGS]);
    });
});
