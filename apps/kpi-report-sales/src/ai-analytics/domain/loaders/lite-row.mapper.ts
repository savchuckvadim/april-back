/**
 * Проекции lite-строки звонка переехали в @lib/sales-ai-analytics
 * (model/dated-lite-row.ts, 17.11.2026): те же строки нужны итогам периода
 * по менеджерам в event-sales. Реэкспорт — чтобы импорты обзора не менялись.
 */
export { hasCallDate, toAgendaRow, toPulseRow } from '@lib/sales-ai-analytics';
export type { DatedLiteRow } from '@lib/sales-ai-analytics';
