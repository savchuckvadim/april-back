/**
 * @lib/rop-reports — каркас периодических отчётов РОПу: периоды и
 * расписание выпуска, выбор получателей по структуре отделов продаж,
 * оформление (BB-код задачи, лист-таблица Excel).
 *
 * Состояние прогонов, доставка и движок тика появятся следующими этапами
 * (ai/tasks/ai-polyansky-method/2026-11-01-periodic-manager-digests.md).
 * Библиотека не импортирует ничего из apps/*.
 */
export * from './period/rop-period';
export * from './period/rop-schedule';
export * from './recipients/department-heads.util';
export * from './recipients/department-scope.util';
export * from './recipients/sales-departments.loader';
export * from './render/excel-table';
