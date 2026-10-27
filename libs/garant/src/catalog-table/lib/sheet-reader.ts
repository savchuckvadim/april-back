import * as ExcelJS from 'exceljs';
import {
    cellToBoolean,
    cellToNullableString,
    cellToNumber,
    cellToString,
} from './cell-value.util';

/**
 * Чтение листа xlsx ПО ЗАГОЛОВКАМ колонок, а не по их индексам:
 * лишние колонки и смена их порядка в файле ничего не ломают, а
 * отсутствие обязательной колонки даёт внятную ошибку вместо тихого
 * разбора мусора (болезнь прежних excel-парсеров каталога).
 */

/** Строка листа с доступом к ячейкам по имени колонки */
export class SheetRow {
    constructor(
        /** Номер строки в файле (для адресации в отчёте) */
        readonly rowNumber: number,
        private readonly cells: Map<string, ExcelJS.CellValue>,
    ) {}

    string(column: string): string {
        return cellToString(this.cells.get(column) ?? null);
    }

    nullableString(column: string): string | null {
        return cellToNullableString(this.cells.get(column) ?? null);
    }

    number(column: string): number | null {
        return cellToNumber(this.cells.get(column) ?? null);
    }

    boolean(column: string): boolean {
        return cellToBoolean(this.cells.get(column) ?? null);
    }

    /** Есть ли колонка в файле (отличает «нет колонки» от «пустая ячейка») */
    has(column: string): boolean {
        return this.cells.has(column);
    }

    /** Все колонки строки, кроме перечисленных — для матричных листов */
    columnsExcept(exclude: readonly string[]): string[] {
        const excluded = new Set(exclude.map(name => name.toLowerCase()));
        return [...this.cells.keys()].filter(
            name => !excluded.has(name.toLowerCase()),
        );
    }
}

export class SheetNotFoundError extends Error {
    constructor(name: string, available: string[]) {
        super(
            `Лист «${name}» не найден в файле. Листы в файле: ${available.join(', ') || '—'}. ` +
                'Скачайте эталонную таблицу и правьте её, не меняя имена листов.',
        );
    }
}

export class MissingColumnsError extends Error {
    constructor(sheet: string, missing: string[], present: string[]) {
        super(
            `На листе «${sheet}» не хватает колонок: ${missing.join(', ')}. ` +
                `Колонки в файле: ${present.join(', ') || '—'}. ` +
                'Скачайте эталонную таблицу и правьте её, не удаляя заголовки.',
        );
    }
}

/** Прочитанный лист: заголовки + строки с доступом по имени колонки */
export class SheetTable {
    constructor(
        readonly name: string,
        /** Заголовки в порядке файла (как написаны) */
        readonly headers: string[],
        readonly rows: SheetRow[],
    ) {}

    /** Проверка обязательных колонок (регистр и пробелы не важны) */
    requireColumns(required: string[]): void {
        const present = new Set(
            this.headers.map(header => header.toLowerCase()),
        );
        const missing = required.filter(
            column => !present.has(column.toLowerCase()),
        );
        if (missing.length > 0) {
            throw new MissingColumnsError(this.name, missing, this.headers);
        }
    }
}

/** Загрузка книги из буфера загруженного файла */
export const readWorkbook = async (
    buffer: Buffer,
): Promise<ExcelJS.Workbook> => {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS ждёт ArrayBuffer-совместимый вход; Buffer подходит в рантайме,
    // но типы требуют приведения.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    return workbook;
};

/**
 * Лист книги по имени (регистр не важен) в виде таблицы со строками.
 * Первая непустая строка — заголовки; строки без единого значения
 * пропускаются.
 */
export const readSheet = (
    workbook: ExcelJS.Workbook,
    name: string,
): SheetTable => {
    const sheet = workbook.worksheets.find(
        worksheet => worksheet.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (!sheet) {
        throw new SheetNotFoundError(
            name,
            workbook.worksheets.map(worksheet => worksheet.name),
        );
    }

    const headerByColumn = new Map<number, string>();
    const headers: string[] = [];
    const rows: SheetRow[] = [];

    sheet.eachRow((row, rowNumber) => {
        if (headerByColumn.size === 0) {
            row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
                const header = cellToString(cell.value);
                if (header === '') return;
                headerByColumn.set(columnNumber, header);
                headers.push(header);
            });
            return;
        }

        const cells = new Map<string, ExcelJS.CellValue>();
        let hasValue = false;
        for (const [columnNumber, header] of headerByColumn) {
            const value = row.getCell(columnNumber).value;
            cells.set(header, value);
            if (cellToString(value) !== '') hasValue = true;
        }
        if (hasValue) rows.push(new SheetRow(rowNumber, cells));
    });

    return new SheetTable(sheet.name, headers, rows);
};

/** Есть ли лист с таким именем (для опциональных листов файла) */
export const hasSheet = (workbook: ExcelJS.Workbook, name: string): boolean =>
    workbook.worksheets.some(
        worksheet => worksheet.name.trim().toLowerCase() === name.toLowerCase(),
    );
