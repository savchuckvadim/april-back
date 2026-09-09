import type { LeverCandidate } from '@lib/sales-ai-analytics';
import { toRecommendations } from '../domain/presenter/levers.presenter';

const lever = (overrides: Partial<LeverCandidate> = {}): LeverCandidate => ({
    lever: 'volume',
    ruleCode: 'volume-below-capacity',
    deltaSales: 1.2,
    ci80: [0.4, 2],
    cost: 90,
    evidence: 'E1',
    adviceAllowed: false,
    basis: ['+30 cold', 'продаж на активность 0,04'],
    ...overrides,
});

const forecastWith = (levers: unknown) => ({ levers });

describe('toRecommendations — рычаги прогноза в строку менеджера', () => {
    it('топ-3 рычага с основанием, кодом правила и уровнем доказательности', () => {
        const result = toRecommendations(
            forecastWith([
                lever(),
                lever({
                    lever: 'checklist',
                    ruleCode: 'checklist-item-missing',
                    section: 'NEXT_STEP',
                    deltaSales: 0.8,
                    evidence: 'E0',
                }),
                lever({
                    lever: 'pipeline',
                    ruleCode: 'pipeline-stuck-deals',
                    deltaSales: 0.5,
                }),
                lever({
                    lever: 'objection',
                    ruleCode: 'objection-worst-outcome',
                    category: 'price',
                }),
            ]),
            { n: 40 },
        );

        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
            lever: 'volume',
            ruleCode: 'volume-below-capacity',
            evidence: 'E1',
            cost: 90,
        });
        expect(result[0].basis).toEqual([
            '+30 cold',
            'продаж на активность 0,04',
        ]);
        expect(result[1]).toMatchObject({
            lever: 'checklist',
            section: 'NEXT_STEP',
            evidence: 'E0',
        });
    });

    it('разборов меньше n_min_none → список пуст', () => {
        expect(toRecommendations(forecastWith([lever()]), { n: 7 })).toEqual(
            [],
        );
        expect(toRecommendations(forecastWith([lever()]), {})).toEqual([]);
    });

    it('прогноза нет или рычагов в нём нет → список пуст', () => {
        expect(toRecommendations(null, { n: 40 })).toEqual([]);
        expect(toRecommendations(undefined, { n: 40 })).toEqual([]);
        expect(toRecommendations(forecastWith(undefined), { n: 40 })).toEqual(
            [],
        );
        expect(toRecommendations(forecastWith('нет'), { n: 40 })).toEqual([]);
    });

    it('рычаг без ожидаемого эффекта отдаётся без числа (уровень E0)', () => {
        const [item] = toRecommendations(
            forecastWith([
                lever({ deltaSales: null, ci80: null, evidence: 'E0' }),
            ]),
            { n: 40 },
        );

        expect(item.deltaSales).toBeUndefined();
        expect(item.evidence).toBe('E0');
    });

    it('чужая форма кандидата отбрасывается, известные поля не теряются', () => {
        const result = toRecommendations(
            forecastWith([
                { lever: 'магия', ruleCode: 'x' },
                { lever: 'quality', ruleCode: 'quality-weak-section' },
                null,
                lever({ evidence: 'E7' as never, basis: ['ок', 5] as never }),
            ]),
            { n: 40 },
        );

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            lever: 'quality',
            cost: 0,
            evidence: 'E0',
            basis: [],
        });
        expect(result[1].evidence).toBe('E0');
        expect(result[1].basis).toEqual(['ок']);
    });

    it('порог показа и число рычагов настраиваются вызовом', () => {
        expect(
            toRecommendations(forecastWith([lever(), lever()]), {
                n: 4,
                minN: 3,
                max: 1,
            }),
        ).toHaveLength(1);
    });
});
