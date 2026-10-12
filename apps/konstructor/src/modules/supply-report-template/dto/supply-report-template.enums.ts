import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

/**
 * Уровень привязки шаблона отчёта о поставке.
 *
 * У `supply_report_templates` НЕТ колонки `visibility` (в отличие от
 * `invoice_templates`): «общий» шаблон выражается как `portal_id IS NULL`,
 * «портальный» — заполненным `portal_id`. Словарь нужен только админке,
 * чтобы из выбранного уровня вывести пару (portal_id, agent_id); в БД он
 * не хранится.
 *
 * Паттерн «рантайм-объект + отдельная константа для типа» повторяет
 * `contract-template.enums.ts` / `invoice-template.enums.ts`: тип выводится
 * от отдельного символа, иначе ESLint в projectService иногда получает
 * внутренний тип `error`.
 */
const supplyReportTemplateScopeSchema = {
    /** Общий для всех порталов: portal_id IS NULL, agent_id IS NULL. */
    COMMON: 'common',
    /** Портальный без привязки к поставщику. */
    PORTAL: 'portal',
    /** Портальный под конкретного поставщика. */
    PROVIDER: 'provider',
} as const;

export const SupplyReportTemplateScope = supplyReportTemplateScopeSchema;

export type SupplyReportTemplateScopeValue =
    (typeof supplyReportTemplateScopeSchema)[keyof typeof supplyReportTemplateScopeSchema];

/**
 * У отчёта о поставке колонки `contract_type` НЕТ — она есть только у
 * `contract_templates`. Поэтому CONTRACT_LTYPE здесь не реэкспортируется:
 * нечего фильтровать.
 */
export { ClientTypeEnum, SupplyTypeEnum };
