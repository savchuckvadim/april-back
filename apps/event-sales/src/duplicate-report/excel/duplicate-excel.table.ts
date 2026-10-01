import * as ExcelJS from 'exceljs';

/**
 * Лист-таблица Excel: заголовок, заметки, шапка, строки. Оформление как у
 * разового отчёта 30.09, который понравился владельцу: Arial, закреплённая
 * шапка, автофильтр, ссылки на карточки, «не работает» красным.
 *
 * Лист описывается колонками (заголовок, ширина, значение из строки), а не
 * кодом по ячейкам: листы отчёта отличаются только набором колонок.
 */

/** Значение ячейки: обычное либо кликабельная ссылка. */
export type ExcelCellValue =
    | string
    | number
    | Date
    | null
    | { text: string; hyperlink: string };

/** Выделение ячейки: жирная (основная сделка) или красная (не работает). */
export type ExcelCellTone = 'bold' | 'red' | null;

export interface ExcelColumn<T> {
    readonly header: string;
    readonly width: number;
    readonly value: (row: T) => ExcelCellValue;
    /** Длинный текст: перенос по словам и высота строки по содержимому. */
    readonly wrap?: boolean;
    readonly numFmt?: string;
    readonly tone?: (row: T) => ExcelCellTone;
}

export interface ExcelTableSheet<T> {
    /** Имя вкладки (Excel режет до 31 символа). */
    readonly name: string;
    readonly title: string;
    /** Пояснения над таблицей — по строке на абзац. */
    readonly notes: readonly string[];
    readonly columns: readonly ExcelColumn<T>[];
    readonly rows: readonly T[];
    /** Сколько колонок закрепить слева при прокрутке. */
    readonly frozenColumns: number;
}

export const DATE_FMT = 'dd.mm.yyyy';
export const MONEY_FMT = '#,##0" ₽";-#,##0" ₽";"–"';

const FONT: Partial<ExcelJS.Font> = { name: 'Arial', size: 10 };
const BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true };
const RED: Partial<ExcelJS.Font> = { ...FONT, color: { argb: 'FFC00000' } };
const LINK: Partial<ExcelJS.Font> = {
    ...FONT,
    color: { argb: 'FF0563C1' },
    underline: true,
};
const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDDEBF7' },
};
const NOTE_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF7F7F7' },
};
const THIN: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: 'FFBFBFBF' },
};
const BORDER: Partial<ExcelJS.Borders> = {
    top: THIN,
    left: THIN,
    bottom: THIN,
    right: THIN,
};
/** Высота строки текста Arial 10 в пунктах. */
const LINE_PT = 13;

const isLink = (
    value: ExcelCellValue,
): value is { text: string; hyperlink: string } =>
    value !== null && typeof value === 'object' && !(value instanceof Date);

const fontOf = (
    value: ExcelCellValue,
    tone: ExcelCellTone,
): Partial<ExcelJS.Font> => {
    if (isLink(value)) return tone === 'bold' ? { ...LINK, bold: true } : LINK;
    if (tone === 'bold') return BOLD;
    if (tone === 'red') return RED;
    return FONT;
};

/** Сколько строк займёт текст в колонке ширины `width` (с учётом `\n`). */
const lineCount = (value: ExcelCellValue, width: number): number => {
    if (value === null || value instanceof Date) return 1;
    const text = String(isLink(value) ? value.text : value);
    const perLine = Math.max(4, width * 1.15);
    return text
        .split('\n')
        .reduce(
            (sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)),
            0,
        );
};

/** Лист с таблицей в книге; пустой список строк — только шапка. */
export function writeTableSheet<T>(
    workbook: ExcelJS.Workbook,
    sheet: ExcelTableSheet<T>,
): ExcelJS.Worksheet {
    const headerRow = sheet.notes.length + 2;
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), {
        views: [
            {
                state: 'frozen',
                xSplit: sheet.frozenColumns,
                ySplit: headerRow,
                showGridLines: false,
            },
        ],
    });
    const columnCount = sheet.columns.length;
    worksheet.columns = sheet.columns.map(column => ({ width: column.width }));
    const notesWidth = sheet.columns.reduce((sum, c) => sum + c.width, 0);

    const title = worksheet.getCell(1, 1);
    title.value = sheet.title;
    title.font = { ...BOLD, size: 13 };
    sheet.notes.forEach((note, index) => {
        const rowNumber = 2 + index;
        worksheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
        const cell = worksheet.getCell(rowNumber, 1);
        cell.value = note;
        cell.font = FONT;
        cell.fill = NOTE_FILL;
        cell.alignment = { vertical: 'top', wrapText: true };
        worksheet.getRow(rowNumber).height =
            Math.ceil(note.length / Math.max(40, notesWidth * 1.1)) * LINE_PT +
            6;
    });

    const header = worksheet.getRow(headerRow);
    sheet.columns.forEach((column, index) => {
        const cell = header.getCell(index + 1);
        cell.value = column.header;
        cell.font = BOLD;
        cell.fill = HEADER_FILL;
        cell.border = BORDER;
        cell.alignment = { vertical: 'middle', wrapText: true };
    });
    header.height = 30;

    sheet.rows.forEach((item, rowIndex) => {
        const excelRow = worksheet.getRow(headerRow + 1 + rowIndex);
        let lines = 1;
        sheet.columns.forEach((column, index) => {
            const value = column.value(item);
            const cell = excelRow.getCell(index + 1);
            cell.value = value;
            cell.font = fontOf(value, column.tone?.(item) ?? null);
            cell.border = BORDER;
            cell.alignment = { vertical: 'top', wrapText: !!column.wrap };
            if (column.numFmt) cell.numFmt = column.numFmt;
            if (column.wrap) {
                lines = Math.max(lines, lineCount(value, column.width));
            }
        });
        excelRow.height = Math.max(16, lines * LINE_PT + 4);
    });

    worksheet.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: {
            row: headerRow + Math.max(sheet.rows.length, 1),
            column: columnCount,
        },
    };
    return worksheet;
}
