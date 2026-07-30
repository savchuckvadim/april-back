import { IsoDate, nextDay, prevDay } from './month-segments.util';

/**
 * Нормализация периода отчёта к каноничным ISO-границам.
 *
 * Исторически фронт шлёт даты в ДВУХ форматах с РАЗНОЙ семантикой:
 *  - легаси `DD.MM.YYYY`: dateTo уже ЭКСКЛЮЗИВНА (старый фронт делает +1 день
 *    сам — modifyDateToReportRequest);
 *  - канонично `YYYY-MM-DD` (допустим полный ISO с временем — время
 *    отбрасывается): dateFrom/dateTo ВКЛЮЧИТЕЛЬНЫ, эксклюзивную верхнюю
 *    границу (+1 день) строит бэкенд.
 *
 * Формат и есть дискриминатор семантики — новых полей в API не нужно, а
 * один и тот же логический период из старого и нового фронта нормализуется
 * в ОДИН ключ кэша/jobId. Разбор ручной по компонентам даты, без
 * Date/toISOString — никаких UTC-сдвигов дня (баг прежнего parseToISO).
 */
export interface NormalizedReportPeriod {
    /** Нижняя граница, включительно (yyyy-MM-dd). */
    fromIso: IsoDate;
    /** Верхняя граница, включительно — каноничная часть ключей кэша/jobId. */
    toIsoInclusive: IsoDate;
    /** Верхняя граница, эксклюзивно — для строгих `<`-фильтров Битрикса. */
    toIsoExclusive: IsoDate;
    /** Запрос пришёл в легаси-формате DD.MM.YYYY. */
    legacyFormat: boolean;
    /**
     * Значения для ФИЛЬТРОВ Битрикса — ВСЕГДА `DD.MM.YYYY`:
     * bitrixFrom включителен, bitrixTo ЭКСКЛЮЗИВЕН (выбранная дата + 1
     * день — чтобы последний день попадал целиком; так делал старый фронт).
     *
     * Прод-инцидент 2026-07-30: `lists.element.get` НЕ понимает ISO
     * `yyyy-MM-dd` в фильтрах списковых дат — счётчики возвращались
     * нулями. ISO живёт только во внутренних ключах кэша/дедупа, в
     * Битрикс уходит исключительно исторически проверенный формат.
     */
    bitrixFrom: string;
    bitrixTo: string;
}

/** Ошибка формата/семантики периода — контроллер отдаёт её как 400. */
export class ReportPeriodError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReportPeriodError';
    }
}

const LEGACY_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/;

interface ParsedDate {
    iso: IsoDate;
    legacy: boolean;
}

function parseDate(raw: string, field: string): ParsedDate {
    const value = String(raw ?? '').trim();

    const legacyMatch = LEGACY_RE.exec(value);
    if (legacyMatch) {
        const [, dd, mm, yyyy] = legacyMatch;
        return {
            iso: buildValidIso(+yyyy, +mm, +dd, field, value),
            legacy: true,
        };
    }

    const isoMatch = ISO_RE.exec(value);
    if (isoMatch) {
        const [, yyyy, mm, dd] = isoMatch;
        return {
            iso: buildValidIso(+yyyy, +mm, +dd, field, value),
            legacy: false,
        };
    }

    throw new ReportPeriodError(
        `Неверный формат даты ${field}: «${value}». ` +
            'Ожидается YYYY-MM-DD (канонично) или DD.MM.YYYY (легаси).',
    );
}

function buildValidIso(
    year: number,
    month: number,
    day: number,
    field: string,
    raw: string,
): IsoDate {
    // Roundtrip через Date.UTC ловит несуществующие даты (31.02 и т.п.).
    const probe = new Date(Date.UTC(year, month - 1, day));
    const valid =
        probe.getUTCFullYear() === year &&
        probe.getUTCMonth() === month - 1 &&
        probe.getUTCDate() === day;
    if (!valid) {
        throw new ReportPeriodError(`Несуществующая дата ${field}: «${raw}».`);
    }
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}` as IsoDate;
}

/** yyyy-MM-dd → DD.MM.YYYY (формат фильтров Битрикса). */
function toBitrixDate(iso: IsoDate): string {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
}

export function normalizeReportPeriod(
    dateFrom: string,
    dateTo: string,
): NormalizedReportPeriod {
    const from = parseDate(dateFrom, 'dateFrom');
    const to = parseDate(dateTo, 'dateTo');

    if (from.legacy !== to.legacy) {
        throw new ReportPeriodError(
            'Смешанные форматы дат dateFrom/dateTo — используйте YYYY-MM-DD ' +
                'для обеих границ.',
        );
    }

    const legacyFormat = from.legacy;
    // Легаси: dateTo уже эксклюзивна (фронт прибавил день сам).
    const toIsoExclusive = legacyFormat ? to.iso : nextDay(to.iso);
    const toIsoInclusive = legacyFormat ? prevDay(to.iso) : to.iso;

    if (from.iso > toIsoInclusive) {
        throw new ReportPeriodError(
            `Начало периода (${from.iso}) позже конца (${toIsoInclusive}).`,
        );
    }

    return {
        fromIso: from.iso,
        toIsoInclusive,
        toIsoExclusive,
        legacyFormat,
        // Всегда DD.MM.YYYY (для легаси-входа равно исходным строкам).
        bitrixFrom: toBitrixDate(from.iso),
        bitrixTo: toBitrixDate(toIsoExclusive),
    };
}
