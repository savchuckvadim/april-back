/**
 * Руководители сотрудника по снимку структуры переехали в @lib/rop-reports
 * (17.11.2026): там же выбор получателей отчётов РОПу. Реэкспорт — чтобы
 * импорты event-sales остались прежними.
 */
export {
    buildHeadsByUser,
    headsOf,
    headsOfUsers,
    toId,
} from '@lib/rop-reports';
export type { DepartmentLike } from '@lib/rop-reports';
