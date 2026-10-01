/**
 * «Свой отдел» получателя сводки переехал в shared/department-heads: он
 * нужен и отчёту по дублям сделок (duplicate-report). Реэкспорт — чтобы
 * импорты deal-audit остались прежними.
 */
export { departmentScopeOf } from '../../shared/department-heads/department-scope.util';
