import {
    pipelineEpisodeExpected,
    pipelineExpected,
    type PipelineExpectedInput,
} from '../model/forecast';
import { topPipelineEpisodes } from '../model/forecast-pipeline-top';

/** Доля продаж, закрывающихся к возрасту: линейно до 100 дней. */
const cdf = { at: (days: number): number => Math.min(1, days / 100) };

const input = (
    over: Partial<PipelineExpectedInput> = {},
): PipelineExpectedInput =>
    ({
        episodes: [
            { id: 'deal:1', ageDays: 5, theta: 0.5 },
            { id: 'deal:2', ageDays: 400, theta: 0.9 },
            { id: 'deal:3', ageDays: 20, theta: 0.2 },
            { ageDays: 10, theta: 0.5 },
        ],
        cdf,
        daysRemaining: 15,
        ...over,
    }) as PipelineExpectedInput;

describe('самые «тяжёлые» открытые сделки прогноза', () => {
    it('сумма вкладов сделок равна ожиданию от пайплайна', () => {
        const source = input();
        const sum = source.episodes.reduce(
            (total, episode) =>
                total + pipelineEpisodeExpected(episode, source),
            0,
        );
        expect(pipelineExpected(source).value).toBeCloseTo(sum, 12);
    });

    it('сделки — по убыванию вклада, не больше лимита', () => {
        const top = topPipelineEpisodes(input(), 2);
        expect(top).toHaveLength(2);
        expect(top[0].expected).toBeGreaterThanOrEqual(top[1].expected);
        expect(top.map(item => item.id)).toEqual([null, 'deal:1']);
    });

    it('давно открытая сделка ожидания не даёт: всё, что могло закрыться, уже закрылось бы', () => {
        const old = topPipelineEpisodes(input(), 10).find(
            item => item.id === 'deal:2',
        );
        expect(old).toEqual({
            id: 'deal:2',
            ageDays: 400,
            theta: 0.9,
            expected: 0,
        });
    });

    it('порядок не зависит от порядка сделок на входе', () => {
        const source = input();
        const reversed = input({ episodes: [...source.episodes].reverse() });
        expect(topPipelineEpisodes(reversed, 10)).toEqual(
            topPipelineEpisodes(source, 10),
        );
    });

    it('нет сделок или лимит ноль — пусто', () => {
        expect(topPipelineEpisodes(input({ episodes: [] }), 5)).toEqual([]);
        expect(topPipelineEpisodes(input(), 0)).toEqual([]);
    });
});
