import { IUserFieldConfig } from '@/modules/bitrix';
import { Field } from '../../parse-field-excel';

/**
 * Контекст Bitrix для одной «типизированной» сущности (один smart-process / один RPA).
 * В отличие от обычных CRM-сущностей (DEAL/COMPANY/...) у этих entityId динамический,
 * поэтому он передаётся снаружи — оркестратор резолвит smart/rpa по `(domain, type, group)`
 * и формирует ctx.
 *
 * Примеры:
 * - smart с smartTypeId=8 (crm):
 *   `{ moduleId: 'crm', bitrixEntityId: 'CRM_8', bxFieldNamePrefix: 'UF_CRM_8_' }`
 * - rpa с типом 167 (rpa):
 *   `{ moduleId: 'rpa', bitrixEntityId: 'DYNAMIC_167', bxFieldNamePrefix: 'UF_RPA_167_' }`
 *   (точный prefix у rpa может отличаться — задаётся резолвером rpa).
 */
export interface TypedEntityFieldCtx {
    /** `crm` для смарта, `rpa` для RPA — moduleId в `userfieldconfig.*`. */
    moduleId: 'crm' | 'rpa';
    /** Значение `entityId` для `userfieldconfig.*` (по нему фильтруется list/filter). */
    bitrixEntityId: string;
    /** Префикс UF-имени поля; конкатенируется с `parseField.bxFieldName` после очистки. */
    bxFieldNamePrefix: string;
}

/** Один результат одной batch-команды userfieldconfig (add/update). */
export interface IBxTypedFieldInstallResult {
    code: string;
    result: unknown;
}

/** Тот же результат после повторного list + матчинга с шаблонным полем. */
export interface IBxTypedFieldWithParsedResult
    extends IBxTypedFieldInstallResult {
    parsedField: Field;
    bxField: IUserFieldConfig | undefined;
}

/** Итог install-фазы Bitrix: счётчики + per-field результаты + коды с ошибками батча. */
export interface IBxTypedEntityFieldsInstallResult {
    errorCodes: string[];
    results: IBxTypedFieldWithParsedResult[];
    countSuccess: number;
    countFailed: number;
    countTotal: number;
}

/** Те же результаты, но с гарантированно непустым `bxField` — приходит в syncWithDb. */
export interface IPbxTypedFieldInstallData extends IBxTypedFieldInstallResult {
    parsedField: Field;
    bxField: IUserFieldConfig;
}
