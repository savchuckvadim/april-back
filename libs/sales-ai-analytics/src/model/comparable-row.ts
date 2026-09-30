/**
 * Сравнимость строки матрицы (план §5.4) — два РАЗНЫХ основания разрыва:
 *
 * 1. Версия разбора (`comparableVersionFrom`, прежнее имя `comparableFrom`).
 *    Строка сравнима, если дата её СОБСТВЕННОГО набора versions (prompt /
 *    rubric / registry / attribution / classifier — та же функция
 *    `comparableFrom`, что считает границу периода по версиям) не раньше
 *    границы. День звонка не участвует: звонок 24.09, разобранный версией
 *    от 25.09, сравним; звонок 26.09, разобранный старой версией, — нет.
 *    Строка без versions или без дат в них — прежнее правило, по дню звонка.
 * 2. Разрыв ряда сменой настроек портала (`seriesBreakFrom`) — по дню
 *    звонка в TZ портала: новые правила касаются разговоров после смены,
 *    какой бы версией их ни разобрали.
 *
 * Звонок без даты там, где сравнивается день, — до границы. Чистые функции.
 */
import { comparableFrom } from '../contracts/versions.types';
import type {
    MatrixCallRow,
    MatrixComparability,
    MatrixOptions,
} from './matrix.types';
import { DEFAULT_WORK_CALENDAR, toPortalDate } from './workdays.util';

/** Поля строки, от которых зависит сравнимость. */
export type ComparableRow = Pick<MatrixCallRow, 'versions' | 'callStartedAt'>;

const boundaryOf = (value: string | undefined): string | null =>
    value === undefined || value === '' ? null : value;

/** Опции матрицы → границы; прежний `comparableFrom` — граница версий. */
export function matrixComparability(
    options: MatrixOptions,
): MatrixComparability {
    return {
        versionFrom: boundaryOf(
            options.comparableVersionFrom ?? options.comparableFrom,
        ),
        seriesBreakFrom: boundaryOf(options.seriesBreakFrom),
        timeZone: options.timeZone ?? DEFAULT_WORK_CALENDAR.timeZone,
    };
}

/** Дата набора версий строки: max дат в значениях versions; дат нет — null. */
export function rowVersionsDate(
    row: Pick<MatrixCallRow, 'versions'>,
): string | null {
    if (!row.versions) return null;
    return comparableFrom(Object.values(row.versions)) || null;
}

/** День звонка в TZ портала раньше границы; звонок без даты — раньше. */
function callDayBefore(
    row: ComparableRow,
    from: string,
    timeZone: string,
): boolean {
    return (
        row.callStartedAt === null ||
        toPortalDate(row.callStartedAt, timeZone) < from
    );
}

/** Разбор старше границы версий; строка без дат версий — по дню звонка. */
function versionBefore(
    row: ComparableRow,
    from: string,
    timeZone: string,
): boolean {
    const date = rowVersionsDate(row);
    return date === null ? callDayBefore(row, from, timeZone) : date < from;
}

/** Строка до границы сравнимости: в оценки не идёт, считается отдельно. */
export function isBeforeComparable(
    row: ComparableRow,
    comparability: MatrixComparability,
): boolean {
    const { versionFrom, seriesBreakFrom, timeZone } = comparability;
    return (
        (seriesBreakFrom !== null &&
            callDayBefore(row, seriesBreakFrom, timeZone)) ||
        (versionFrom !== null && versionBefore(row, versionFrom, timeZone))
    );
}

/** Действующая граница для отчёта: поздняя из двух; нет обеих — null. */
export function effectiveComparableFrom(
    comparability: MatrixComparability,
): string | null {
    const { versionFrom, seriesBreakFrom } = comparability;
    if (versionFrom === null) return seriesBreakFrom;
    if (seriesBreakFrom === null) return versionFrom;
    return versionFrom > seriesBreakFrom ? versionFrom : seriesBreakFrom;
}
