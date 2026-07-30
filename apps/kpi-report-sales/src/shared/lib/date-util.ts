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
     * Значения для ФИЛЬТРОВ Битрикса (страховка обратной совместимости):
     * легаси-запрос шлёт ИСХОДНЫЕ строки байт-в-байт, как текущий прод
     * (нормализация используется только для ключей кэша/дедупа); канон —
     * ISO (`>` bitrixFrom / `<` bitrixTo). Так поведение старого фронта
     * не меняется вовсе, а ISO в фильтрах проверяется только новым фронтом.
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
        bitrixFrom: legacyFormat ? String(dateFrom).trim() : from.iso,
        bitrixTo: legacyFormat ? String(dateTo).trim() : toIsoExclusive,
    };
}
