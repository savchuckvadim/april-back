import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

/**
 * Уровень привязки шаблона договора.
 *
 * У `contract_templates` НЕТ колонки `visibility` — в отличие от
 * `invoice_templates`. «Общий» шаблон выражается как `portal_id IS NULL`,
 * «портальный» — как заполненный `portal_id`. Это сознательно: два
 * существующих словаря visibility в проекте противоречат друг другу
 * (`offer_templates_visibility` = public|private|user,
 * `invoice_templates_visibility` = public|portal|provider), поэтому и
 * резолвер, и CRUD ключуются только по паре (portal_id, agent_id).
 *
 * Этот словарь нужен только для УДОБСТВА админки: он описывает, какой
 * уровень выбрал пользователь, и из него выводятся portal_id/agent_id.
 * В БД он не хранится.
 *
 * Паттерн «рантайм-объект + отдельная константа для типа» повторяет
 * `invoice-template.enums.ts`: тип выводится от отдельного символа, иначе
 * ESLint в projectService иногда получает внутренний тип `error`.
 */
const contractTemplateScopeSchema = {
    /** Общий для всех порталов: portal_id IS NULL, agent_id IS NULL. */
    COMMON: 'common',
    /** Портальный без привязки к поставщику. */
    PORTAL: 'portal',
    /** Портальный под конкретного поставщика. */
    PROVIDER: 'provider',
} as const;

export const ContractTemplateScope = contractTemplateScopeSchema;

export type ContractTemplateScopeValue =
    (typeof contractTemplateScopeSchema)[keyof typeof contractTemplateScopeSchema];

/** Реэкспорт: сами словари живут в document-generate. */
export { CONTRACT_LTYPE, ClientTypeEnum, SupplyTypeEnum };
