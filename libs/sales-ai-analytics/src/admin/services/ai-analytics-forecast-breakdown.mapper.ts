/**
 * Чтение сохранённых нагрузок прогноза для разложения: день журнала отдела
 * (`ai-analytics-forecast-log`) и прогноз менеджера за день
 * (`ai-analytics-forecast`). Нагрузка — JSON из `ais`: чужая или старая форма
 * читается терпимо, нет поля — null, ручка не падает. Чистые функции.
 */
import type {
    ForecastBreakdownDepartmentView,
    ForecastBreakdownEpisodeView,
    ForecastBreakdownManagerView,
} from './ai-analytics-forecast-breakdown.types';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Разность слагаемых не меньше нуля; нет одного из чисел — null. */
const gap = (total: number | null, part: number | null): number | null =>
    total === null || part === null ? null : Math.max(0, total - part);

/** Последний (по дате) день журнала месяца с серединой прогноза. */
function lastDay(payload: unknown): Json | null {
    if (!isRecord(payload) || !Array.isArray(payload.days)) return null;
    let last: Json | null = null;
    for (const day of payload.days as unknown[]) {
        if (!isRecord(day) || typeof day.day !== 'string') continue;
        if (num(day.p50) === null || num(day.done) === null) continue;
        if (last === null || day.day > (last.day as string)) last = day;
    }
    return last;
}

/** Разложение отдела из журнала месяца; журнал пуст или чужой формы — null. */
export function toDepartmentBreakdown(
    monthKey: string,
    payload: unknown,
): ForecastBreakdownDepartmentView | null {
    const day = lastDay(payload);
    if (day === null) return null;
    const p50 = num(day.p50) ?? 0;
    const done = num(day.done) ?? 0;
    // «Сделано + открытые сделки»: поле появилось 16.11.2026.
    const descriptive = num(day.descriptive);
    return {
        day: day.day as string,
        monthKey,
        p50,
        low: num(day.low) ?? p50,
        high: num(day.high) ?? p50,
        done,
        pipeline: gap(descriptive, done),
        newFlow: gap(p50, descriptive),
        naive: num(day.naive) ?? 0,
        mean3: num(day.mean3),
        managers: num(day.managers) ?? 0,
        pipelineUnknown: num(day.pipelineUnknown) ?? 0,
    };
}

function episodeOf(value: unknown): ForecastBreakdownEpisodeView | null {
    if (!isRecord(value)) return null;
    const expected = num(value.expected);
    if (expected === null) return null;
    return {
        id: typeof value.id === 'string' ? value.id : null,
        ageDays: num(value.ageDays) ?? 0,
        theta: num(value.theta),
        expected,
    };
}

/** Разложение менеджера из его прогноза за день; чужая форма — null. */
export function toManagerBreakdown(
    managerId: string,
    payload: unknown,
): ForecastBreakdownManagerView | null {
    if (!isRecord(payload)) return null;
    const p50 = num(payload.p50);
    const done = num(payload.doneSales);
    if (p50 === null || done === null) return null;
    const breakdown = isRecord(payload.breakdown) ? payload.breakdown : null;
    const target = isRecord(payload.target) ? payload.target : null;
    const episodes = Array.isArray(breakdown?.topEpisodes)
        ? (breakdown.topEpisodes as unknown[])
        : [];
    return {
        managerId,
        p50,
        done,
        pipeline: num(payload.pipelineExpected),
        newFlow: num(payload.newFlowExpected),
        naive: num(payload.naive) ?? 0,
        target: target && target.empty !== true ? num(target.value) : null,
        entryDone: num(breakdown?.entryDone),
        entryRate: num(breakdown?.entryRate),
        conversion: num(breakdown?.conversion),
        fBar: num(breakdown?.fBar),
        openEpisodes: num(breakdown?.openEpisodes),
        topEpisodes: episodes
            .map(episodeOf)
            .filter(
                (item): item is ForecastBreakdownEpisodeView => item !== null,
            ),
    };
}
