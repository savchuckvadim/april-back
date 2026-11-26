import type { CellValue, Row } from 'exceljs';

/**
 * Плановые колонки основных листов Excel KPI-отчёта: фронт ставит колонку
 * плана вплотную перед её показателем (`kind: 'plan'`), бэк только
 * оформляет — заметка у шапки, плановая заливка ячеек, «—» без плана.
 * Строки «— план» под сотрудниками при этом не выводятся, на листах
 * рейтингов плановых колонок нет.
 */

/** Вид колонки строки отчёта: «plan» — колонка плана перед своим показателем. */
export const DOWNLOAD_KPI_ITEM_KINDS = ['plan'] as const;
export type DownloadKpiItemKind = (typeof DOWNLOAD_KPI_ITEM_KINDS)[number];

/** Предел текста заметки к шапке плановой колонки. */
export const DOWNLOAD_KPI_NOTE_MAX_LENGTH = 300;

/** Мягкая заливка плановых строк/колонок (голубая, читаема при печати). */
export const PLAN_FILL_ARGB = 'FFDCE9F7';

/** Значение ячейки плановой колонки, когда плана нет. */
export const PLAN_EMPTY_VALUE = '—';

/** Колонка показателя в строке отчёта (поля, нужные оформлению). */
export interface ExcelKpiColumn {
    action: string;
    count?: number | null;
    kind?: DownloadKpiItemKind;
    note?: string;
}

/** Первая колонка листа — ФИО, показатели начинаются со второй. */
const FIRST_KPI_COLUMN = 2;

export const isPlanColumn = (kpi: Pick<ExcelKpiColumn, 'kind'>): boolean =>
    kpi.kind === 'plan';

/** Есть ли в строках хоть одна плановая колонка. */
export function hasPlanColumns(
    rows: readonly { kpi: readonly Pick<ExcelKpiColumn, 'kind'>[] }[],
): boolean {
    return rows.some(row => row.kpi.some(isPlanColumn));
}

/**
 * Значение ячейки показателя: у плановой колонки без плана — «—»,
 * остальное — как пришло.
 */
export function kpiCellValue(
    kpi: Pick<ExcelKpiColumn, 'kind' | 'count'>,
): CellValue {
    if (isPlanColumn(kpi) && (kpi.count === null || kpi.count === undefined)) {
        return PLAN_EMPTY_VALUE;
    }
    return kpi.count;
}

/** Заметки шапки: у плановой колонки с текстом — заметка Excel, стиль шапки не меняется. */
export function applyPlanHeadNotes(
    headRow: Row,
    kpis: readonly Pick<ExcelKpiColumn, 'kind' | 'note'>[],
): void {
    kpis.forEach((kpi, index) => {
        const note = kpi.note?.trim();
        if (isPlanColumn(kpi) && note) {
            headRow.getCell(index + FIRST_KPI_COLUMN).note = note;
        }
    });
}

/** Ячейки плановых колонок строки (сотрудник или итог) — плановая заливка; «—» — вправо. */
export function fillPlanCells(
    row: Row,
    kpis: readonly Pick<ExcelKpiColumn, 'kind'>[],
): void {
    kpis.forEach((kpi, index) => {
        if (!isPlanColumn(kpi)) return;
        const cell = row.getCell(index + FIRST_KPI_COLUMN);
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: PLAN_FILL_ARGB },
        };
        if (cell.value === PLAN_EMPTY_VALUE) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
    });
}

/**
 * Планы для строк «— план» под сотрудниками: если план уже стоит
 * колонками, строки не выводятся (план не повторяется дважды).
 */
export function planSubRowsOf<T>(
    rows: readonly { kpi: readonly Pick<ExcelKpiColumn, 'kind'>[] }[],
    planRows: T[] | undefined,
): T[] | undefined {
    return hasPlanColumns(rows) ? undefined : planRows;
}

/** Колонки листов рейтингов: без плановых, с местом колонки в строке отчёта. */
export function ratingColumns(
    kpis: readonly Pick<ExcelKpiColumn, 'kind' | 'action'>[],
): { action: string; index: number }[] {
    return kpis.flatMap((kpi, index) =>
        isPlanColumn(kpi) ? [] : [{ action: kpi.action, index }],
    );
}
