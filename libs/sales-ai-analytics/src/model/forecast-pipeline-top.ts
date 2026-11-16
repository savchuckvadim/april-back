/**
 * Самые «тяжёлые» открытые сделки прогноза: какие эпизоды дают основную
 * часть ожидания от пайплайна `λ_pipe`. Нужно разложению прогноза (Фаза 4):
 * когда прогноз завышен в разы, по этому списку видно, не тянут ли его
 * давно брошенные открытые сделки.
 *
 * Чистая математика: вклад эпизода — то же слагаемое, что суммирует
 * `pipelineExpected`.
 */
import {
    pipelineEpisodeExpected,
    type PipelineEpisode,
    type PipelineExpectedInput,
} from './forecast';

/** Открытая сделка и её вклад в ожидание от пайплайна. */
export interface PipelineEpisodeShare {
    /** Ключ эпизода (сделка); null — у эпизода нет ключа. */
    readonly id: string | null;
    /** Возраст эпизода, календарных дней. */
    readonly ageDays: number;
    /** Вероятность продажи из стадии эпизода; null — форма без θ. */
    readonly theta: number | null;
    /** Ожидаемых продаж от этой сделки до конца месяца. */
    readonly expected: number;
}

const shareOf = (
    episode: PipelineEpisode,
    input: PipelineExpectedInput,
): PipelineEpisodeShare => ({
    id: episode.id ?? null,
    ageDays: Number.isFinite(episode.ageDays) ? episode.ageDays : 0,
    theta:
        typeof episode.theta === 'number' && Number.isFinite(episode.theta)
            ? episode.theta
            : null,
    expected: pipelineEpisodeExpected(episode, input),
});

/**
 * Первые `limit` открытых сделок по убыванию вклада; при равном вкладе —
 * старшие по возрасту, затем по ключу (порядок не зависит от входа).
 */
export function topPipelineEpisodes(
    input: PipelineExpectedInput,
    limit: number,
): PipelineEpisodeShare[] {
    return input.episodes
        .map(episode => shareOf(episode, input))
        .sort(
            (a, b) =>
                b.expected - a.expected ||
                b.ageDays - a.ageDays ||
                (a.id ?? '').localeCompare(b.id ?? ''),
        )
        .slice(0, Math.max(0, Math.floor(limit)));
}
