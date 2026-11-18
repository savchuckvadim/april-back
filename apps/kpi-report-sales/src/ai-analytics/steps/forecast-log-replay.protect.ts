/**
 * Какие дни журнала прогноза воспроизведение может переписать (шаг
 * `forecast-log-replay`). Живые дни ночного прогона неприкосновенны;
 * исключение — дни другого метода расчёта (до 18.11.2026 — по звонкам),
 * и только при догоне месяца из админки с force: пересчёт истории
 * запускают люди, а не ночной или месячный прогон (решение владельца
 * 17.11.2026).
 *
 * Вынесено из `forecast-log-replay.facts.ts` по лимиту 300 строк.
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    AI_FORECAST_METHOD_CURRENT,
    forecastMethodOf,
    type ForecastLogDay,
    type ForecastLogSnapshot,
} from '@lib/sales-ai-analytics';
import type { AiPipelineStepContext } from './step.types';

/** День журнала записан ночным прогоном, а не воспроизведён. */
export const isLiveDay = (day: ForecastLogDay): boolean =>
    day.replayed !== true;

/** Переписывать ли живые дни другого метода: только догон с force. */
export const replacesOtherMethod = (
    ctx: Pick<AiPipelineStepContext, 'rhythm' | 'forceRefresh'>,
): boolean => ctx.rhythm === 'backfill' && ctx.forceRefresh;

/**
 * Живой день неприкосновенен: всегда — если записан текущим методом;
 * день другого метода — пока не разрешено его переписать.
 */
export function isProtectedDay(
    day: ForecastLogDay,
    replaceOtherMethod = false,
): boolean {
    return (
        isLiveDay(day) &&
        (!replaceOtherMethod ||
            forecastMethodOf(day.method) === AI_FORECAST_METHOD_CURRENT)
    );
}

/**
 * Какие рабочие дни восстанавливать: все, пока в журнале нет
 * неприкосновенных дней; иначе — только раньше первого из них. Прежние
 * воспроизведённые дни переписываются всегда.
 */
export function replayDaysOf(
    previous: ForecastLogSnapshot | null,
    workdays: readonly string[],
    replaceOtherMethod = false,
): string[] {
    const kept = (previous?.days ?? [])
        .filter(day => isProtectedDay(day, replaceOtherMethod))
        .map(day => day.day)
        .sort();
    const firstKept = kept[0];

    return firstKept === undefined
        ? [...workdays]
        : workdays.filter(day => day < firstKept);
}
