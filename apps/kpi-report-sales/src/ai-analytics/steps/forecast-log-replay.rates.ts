/**
 * Дневные темпы воспроизведения журнала прогноза: звонков (вход плана дня
 * и рычагов) и презентаций (вход середины прогноза, метод
 * `presentations-v2`). KPI по дням не хранится, поэтому темп к любому дню
 * месяца M — прошлый месяц на его рабочие дни; прошлого месяца нет —
 * средний темп самого M (честная деградация с оглядкой в будущее — иначе
 * остался бы ноль, то есть «активности нет»).
 *
 * Вынесено из `forecast-log-replay.facts.ts` по лимиту 300 строк.
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import type { AiForecastEntry } from '@lib/sales-ai-analytics';
import { monthPresentationsOf } from '../domain/assembler/forecast-flow.portal';
import type { PortalManagerMonth } from '../domain/assembler/portal-model.types';
import type { ReplayManagerMonths } from './forecast-log-replay.facts';

/** Что известно о темпе менеджера: прошлый месяц и месяц воспроизведения. */
export interface EntryRateOptions {
    readonly months: ReplayManagerMonths;
    /** Рабочих дней календаря в прошлом месяце. */
    readonly previousWorkdays: number;
    /** Рабочих дней календаря в месяце воспроизведения. */
    readonly workdays: number;
}

/** Темп величины месяца по правилу «прошлый месяц, иначе сам месяц». */
function monthRateOf(
    options: EntryRateOptions,
    read: (month: PortalManagerMonth) => number,
): number {
    const { previous, current } = options.months;
    if (previous !== undefined && options.previousWorkdays > 0) {
        return read(previous) / options.previousWorkdays;
    }
    if (current !== undefined && options.workdays > 0) {
        return read(current) / options.workdays;
    }

    return 0;
}

/** Дневной темп учтённых звонков, известный к дню. */
export function entryRateOf(options: EntryRateOptions): number {
    return monthRateOf(options, month => month.callsDone);
}

/** Дневной темп презентаций выбранного счётчика, известный к дню. */
export function presentationRateOf(
    options: EntryRateOptions,
    entry: AiForecastEntry,
): number {
    return monthRateOf(options, month => monthPresentationsOf(month, entry));
}
