/**
 * Поиск РОПа переехал в shared/department-heads: он нужен и оповещениям
 * входа о повторной заявке (lead-to-work). Реэкспорт — чтобы импорты
 * deal-audit остались прежними.
 */
export {
    buildHeadsByUser,
    headsOf,
    toId,
} from '../../shared/department-heads/department-heads.util';
export type { DepartmentLike as AuditDepartmentLike } from '../../shared/department-heads/department-heads.util';
