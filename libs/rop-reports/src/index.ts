/**
 * @lib/rop-reports — каркас периодических отчётов РОПу: периоды и
 * расписание выпуска, выбор получателей по структуре отделов продаж,
 * оформление (BB-код задачи, лист-таблица Excel), состояние прогонов в
 * Redis, доставка задачей с файлом на Диске и движок тика.
 *
 * Сам отчёт (источник данных, настройки, `@Cron`) живёт в приложении
 * (ai/tasks/ai-polyansky-method/2026-11-01-periodic-manager-digests.md).
 * Библиотека не импортирует ничего из apps/*.
 */
export * from './rop-reports.module';
export * from './period/rop-period';
export * from './period/rop-schedule';
export * from './recipients/department-heads.util';
export * from './recipients/department-scope.util';
export * from './recipients/sales-departments.loader';
export * from './recipients/rop-recipients.types';
export * from './recipients/rop-recipients';
export * from './recipients/rop-user-names';
export * from './recipients/rop-working-recipients';
export * from './render/bb-code.util';
export * from './render/excel-table';
export * from './ports/rop-staff.port';
export * from './ports/rop-calendar.port';
export * from './state/rop-keys';
export * from './state/rop-run-summary';
export * from './state/rop-run-state.service';
export * from './state/rop-task-memory.service';
export * from './delivery/rop-delivery.types';
export * from './delivery/rop-disk.uploader';
export * from './delivery/rop-task.channel';
export * from './engine/rop-report.definition';
export * from './engine/rop-tick-report';
export * from './engine/rop-period.runner';
export * from './engine/rop-run-now';
export * from './engine/rop-report.ticker';
