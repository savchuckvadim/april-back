/**
 * Формат значений crm-полей Битрикса переехал в библиотеку Битрикса
 * (правило нужно и приложениям, и libs/call-lib — дублировать нельзя).
 * Здесь остаётся реэкспорт, чтобы не ломать существующие импорты.
 */
export {
    CRM_REF_ENTITY_TYPES,
    CRM_REF_PREFIX,
    buildCrmRefValue,
    parseCrmRefId,
} from '@lib/bitrix/domain/crm/utils/crm-ref-format.util';
export type { CrmRefEntityType } from '@lib/bitrix/domain/crm/utils/crm-ref-format.util';
