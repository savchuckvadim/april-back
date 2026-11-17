/**
 * Лист-таблица Excel переехал в @lib/rop-reports (17.11.2026) — общее
 * оформление Excel-отчётов РОПу. Реэкспорт — чтобы импорты отчёта по
 * дублям остались прежними.
 */
export { DATE_FMT, MONEY_FMT, writeTableSheet } from '@lib/rop-reports';
export type {
    ExcelCellTone,
    ExcelCellValue,
    ExcelColumn,
    ExcelTableSheet,
} from '@lib/rop-reports';
