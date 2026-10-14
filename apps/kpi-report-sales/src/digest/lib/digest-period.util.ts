/**
 * Границы дня дайджеста и правила его кэширования.
 *
 * Даты в Битрикс уходят ТОЛЬКО в `DD.MM.YYYY` (lists.element.get не понимает
 * ISO в фильтрах списковых дат — инцидент 2026-07-30); ISO живёт во
 * внутренних ключах. «Закрытость» дня — по серверному локальному времени,
 * как у splitIntoMonthSegments.
 */
import {
    IsoDate,
    nextDay,
    toIsoDateOf,
} from '../../shared/lib/month-segments.util';
import {
    KPI_DIGEST_CLOSED_DAY_TTL_SECONDS,
    KPI_DIGEST_OPEN_DAY_TTL_SECONDS,
} from '../constants/digest.const';

/** Ошибка формата/семантики даты — контроллер отдаёт её как 400. */
export class DigestDateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DigestDateError';
    }
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Проверка `YYYY-MM-DD` и существования даты (31.02 → ошибка). */
export function assertIsoDate(value: string): IsoDate {
    const match = ISO_RE.exec(String(value ?? '').trim());
    if (!match) {
        throw new DigestDateError(
            `Неверный формат даты «${value}». Ожидается YYYY-MM-DD.`,
        );
    }
    const [, yyyy, mm, dd] = match;
    const probe = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
    const valid =
        probe.getUTCFullYear() === +yyyy &&
        probe.getUTCMonth() === +mm - 1 &&
        probe.getUTCDate() === +dd;
    if (!valid) {
        throw new DigestDateError(`Несуществующая дата «${value}».`);
    }
    return `${yyyy}-${mm}-${dd}` as IsoDate;
}

/** yyyy-MM-dd → DD.MM.YYYY (формат фильтров Битрикса). */
export function isoToBitrixDate(iso: IsoDate): string {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
}

export interface DigestDayBounds {
    /** День дайджеста. */
    date: IsoDate;
    /** Следующий день — эксклюзивная верхняя граница. */
    nextDate: IsoDate;
    /** Границы для фильтров Битрикса: `>`/`>=` from, `<` to. */
    bitrixFrom: string;
    bitrixTo: string;
}

export function dayBounds(date: IsoDate): DigestDayBounds {
    const next = nextDay(date);
    return {
        date,
        nextDate: next,
        bitrixFrom: isoToBitrixDate(date),
        bitrixTo: isoToBitrixDate(next),
    };
}

/** День закрыт, если он раньше сегодняшнего (серверное локальное время). */
export function isClosedDay(date: IsoDate, now: Date = new Date()): boolean {
    return date < toIsoDateOf(now);
}

/** TTL партиции дня: закрытый — долго, сегодня/будущее — короткий буфер. */
export function ttlForDigestDay(date: IsoDate, now: Date = new Date()): number {
    return isClosedDay(date, now)
        ? KPI_DIGEST_CLOSED_DAY_TTL_SECONDS
        : KPI_DIGEST_OPEN_DAY_TTL_SECONDS;
}
