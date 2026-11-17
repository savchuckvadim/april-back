/**
 * Плоский снимок отделов продаж переехал в @lib/rop-reports (17.11.2026).
 * Реэкспорт — чтобы импорты event-sales остались прежними.
 */
export { loadSalesDepartments } from '@lib/rop-reports';
export type { SalesDepartment } from '@lib/rop-reports';
