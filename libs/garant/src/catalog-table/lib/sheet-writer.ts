import * as ExcelJS from 'exceljs';

/**
 * Запись эталонных таблиц каталога. Эталон — всегда экспорт ТЕКУЩЕГО
 * состояния БД: формат листов и заголовков совпадает с тем, что ждёт
 * импорт, поэтому «скачал → поправил → загрузил» работает без правок руками.
 */

/** Значение ячейки эталона */
export type ExportCellValue = string | number | boolean | null;

/** Описание листа на экспорт */
export interface ExportSheet {
    name: string;
    /** Заголовки колонок в нужном порядке */
    headers: string[];
    /** Строки: значения в порядке headers */
    rows: ExportCellValue[][];
    /** Ширины колонок (по индексу headers); не задана — 18 */
    widths?: number[];
    /**
     * Пояснение для человека. Попадает на отдельный лист «как заполнять»,
     * а НЕ под таблицу: любая сервисная строка в области данных была бы
     * прочитана импортом как строка каталога.
     */
    note?: string;
}

const DEFAULT_WIDTH = 18;

/** Имя листа с пояснениями (импорт его не читает) */
export const HELP_SHEET_NAME = 'как заполнять';

/** Книга xlsx из описаний листов, с жирной шапкой и фиксацией первой строки */
export const writeWorkbook = async (sheets: ExportSheet[]): Promise<Buffer> => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'April Admin';
    workbook.created = new Date();

    for (const sheet of sheets) {
        const worksheet = workbook.addWorksheet(sheet.name);
        worksheet.columns = sheet.headers.map((header, index) => ({
            header,
            key: `c${index}`,
            width: sheet.widths?.[index] ?? DEFAULT_WIDTH,
        }));
        worksheet.getRow(1).font = { bold: true };
        worksheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];

        for (const row of sheet.rows) {
            worksheet.addRow(row);
        }
    }

    const notes = sheets.filter(sheet => sheet.note);
    if (notes.length > 0) {
        const help = workbook.addWorksheet(HELP_SHEET_NAME);
        help.columns = [
            { header: 'лист', key: 'sheet', width: 18 },
            { header: 'как заполнять', key: 'note', width: 140 },
        ];
        help.getRow(1).font = { bold: true };
        for (const sheet of notes) {
            const row = help.addRow([sheet.name, sheet.note]);
            row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
};
