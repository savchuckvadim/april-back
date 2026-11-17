import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ETimeZone } from '@lib/shared/lib/date';
import {
    DEAL_MOVEMENT_NIGHT,
    DEAL_MOVEMENT_STALE_STATE_DAYS,
} from '../constants/deal-movement.const';

dayjs.extend(utc);
dayjs.extend(timezone);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * КАЛЕНДАРЬ ДВИЖЕНИЯ СДЕЛОК — чистые функции. Портал считается раз в
 * сутки, ночью по СВОИМ часам: сервер живёт в UTC, а ночь у клиента своя.
 */

/** Последний сохранённый счёт портала (метка в Redis). */
export interface DealMovementLastRun {
    /** День портала 'YYYY-MM-DD'. */
    readonly day: string;
    /** Момент счёта, ISO. */
    readonly at: string;
}

/** День портала 'YYYY-MM-DD' — ключ «сегодня уже считали» и снимка. */
export const dealMovementDayKey = (now: Date, tz: ETimeZone): string =>
    dayjs(now).tz(tz).format('YYYY-MM-DD');

/** У портала ночное окно счёта (02:00–05:00 по его часам). */
export const isDealMovementNight = (now: Date, tz: ETimeZone): boolean => {
    const hour = dayjs(now).tz(tz).hour();
    return (
        hour >= DEAL_MOVEMENT_NIGHT.fromHour &&
        hour < DEAL_MOVEMENT_NIGHT.toHour
    );
};

/** Пора считать: у портала ночь, и сегодня счёта ещё не было. */
export const isDealMovementDue = (input: {
    now: Date;
    tz: ETimeZone;
    /** День последнего счёта; null — портал ещё не считали. */
    lastDay: string | null;
}): boolean =>
    isDealMovementNight(input.now, input.tz) &&
    dealMovementDayKey(input.now, input.tz) !== input.lastDay;

/**
 * Прошлое состояние устарело: счёта не было или он старше 3 суток. Тогда
 * счёт — базовая линия заново: после простоя нельзя выдать накопленные
 * смены статуса разом (решение 17.11.2026).
 */
export const isDealMovementStateStale = (
    lastRunAt: string | null,
    now: Date,
): boolean => {
    if (lastRunAt === null) return true;
    const at = Date.parse(lastRunAt);
    return (
        Number.isNaN(at) ||
        now.getTime() - at > DEAL_MOVEMENT_STALE_STATE_DAYS * DAY_MS
    );
};

/** Метка из Redis → последний счёт; чужая форма — null. */
export const parseDealMovementLastRun = (
    raw: string | null,
): DealMovementLastRun | null => {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null) return null;
        const { day, at } = value as Record<string, unknown>;
        return typeof day === 'string' && typeof at === 'string'
            ? { day, at }
            : null;
    } catch {
        return null;
    }
};
