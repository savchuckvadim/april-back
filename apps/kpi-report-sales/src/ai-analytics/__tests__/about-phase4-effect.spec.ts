import { aboutRecommendationsEffectOf } from '../about/ai-analytics-about.phase4.builder';
import { effectSnapshot } from './fixtures/phase4-snapshots.fixture';

/**
 * «Как считаем» → «Эффект советов»: ни одного числа на малой выборке
 * (правило n_min_none) и сигналы подгонки — отдельно флаги и менеджеры.
 */
describe('about phase4: эффект советов — малая выборка и сигналы подгонки', () => {
    const edge = (before: number, after: number) => ({
        edge: 'presentation_to_offer',
        before: { s: 0, n: before },
        after: { s: after, n: after },
        diff: 1,
        ci90: [0.2, 1] as const,
        n: 1,
    });

    it('одно окно «0 из 1 → 1 из 1» при n_min_none = 8 — ни долей, ни разницы', () => {
        const dto = aboutRecommendationsEffectOf(
            effectSnapshot({ beforeAfter: [edge(1, 1)] }),
        );
        expect(dto?.beforeAfter).toEqual([
            {
                edge: 'presentation_to_offer',
                before: null,
                after: null,
                diff: null,
                windows: 1,
            },
        ]);
    });

    it('мало только «после» — «до» показываем, разницу нет', () => {
        const dto = aboutRecommendationsEffectOf(
            effectSnapshot({ beforeAfter: [edge(20, 3)] }),
        );
        expect(dto?.beforeAfter[0]).toMatchObject({
            before: 0,
            after: null,
            diff: null,
        });
    });

    it('порог — из параметров снапшота: при n_min_none = 1 те же выборки показываются', () => {
        const base = effectSnapshot();
        const dto = aboutRecommendationsEffectOf(
            effectSnapshot({
                beforeAfter: [edge(1, 1)],
                params: { ...base.params, minN: 1 },
            }),
        );
        expect(dto?.beforeAfter[0]).toMatchObject({
            before: 0,
            after: 1,
            diff: { value: 1, low: 0.2, high: 1 },
        });
    });

    it('сигналы подгонки: три флага у одного менеджера — не «у трёх менеджеров»', () => {
        const dto = aboutRecommendationsEffectOf(
            effectSnapshot({ goodhart: { flags: 3, managersWithFlags: 1 } }),
        );
        expect(dto).toMatchObject({ goodhartFlags: 3, goodhartManagers: 1 });
    });
});
