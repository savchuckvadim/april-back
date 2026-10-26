/**
 * Отчёт импорта эталонной таблицы каталога. Единый формат для всех
 * сущностей: ни одна строка файла не теряется молча — всё, что не
 * создано/обновлено, попадает в skipped с причиной или в unchanged.
 */

/** Причина пропуска строки/ячейки файла */
export interface TableImportSkippedRow {
    /** Адресация строки: код сущности, имя листа/колонки */
    key: string;
    reason: string;
}

/** Итог импорта одного листа (или файла целиком) */
export interface TableImportReport {
    /** Имя листа или секции файла */
    section: string;
    created: number;
    updated: number;
    /** Строки без изменений (повторная загрузка того же файла = всё здесь) */
    unchanged: number;
    skipped: TableImportSkippedRow[];
}

export const emptyTableReport = (section: string): TableImportReport => ({
    section,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
});
