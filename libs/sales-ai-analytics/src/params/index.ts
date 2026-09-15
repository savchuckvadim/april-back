/**
 * Публичный API реестра параметров AI-аналитики ОП.
 *
 * Собственный barrel папки: корневой `src/index.ts` библиотеки подключает
 * его отдельно (интеграционный шаг), приложения импортируют только отсюда.
 * Тематические `registry.*.const` наружу не торчат — состав тем меняется
 * чаще, чем публичный контракт; исключение — словари значений, коды рёбер
 * и таблица соответствия анкете Ж, которые нужны DTO и спекам.
 */
export * from './registry.types';
export {
    AI_ANALYTICS_PARAMS,
    AI_ANALYTICS_PARAM_CODES,
    AI_ANALYTICS_PARAM_DEFAULTS,
    findParam,
    isAiAnalyticsParamCode,
} from './registry.const';
export type { AiAnalyticsParam, AiAnalyticsParamCode } from './registry.const';
export {
    AI_DECISION_STAGES_DEFAULT,
    AI_SALES_BASE_STAGE_CODES,
    HOT_CLIENT_DEFINITION_DEFAULT,
    HOT_CLIENT_STAGE_FROM_PREFIX,
} from './registry.definitions.const';
export * from './registry.enums.const';
export * from './registry.edges.const';
export {
    AI_CAP_ACTIVITY_DEFAULTS,
    AI_DURATION_MIN_DEFAULTS,
    capCode,
    durationMinCode,
} from './registry.activity.const';
export {
    AI_SKILL_INDEX_EDGES,
    AI_SKILL_WEIGHT_DEFAULTS,
    skillWeightCode,
} from './registry.pool.const';
export type { AiSkillIndexEdge, AiSkillWeightKey } from './registry.pool.const';
export * from './registry.mapping.const';
export {
    csvItems,
    inParamRange,
    isParamPrimitive,
    paramValueKind,
    validateParamValue,
} from './registry.validate';
export {
    isRegistryValue,
    registryDefault,
    registryEnumDefault,
    registryRangeOf,
    registryValueReason,
} from './registry.access';
export type { AiAnalyticsParamDefault } from './registry.access';
export { resolveParam, resolveNumberParam } from './resolve';
export {
    REGISTRY_VERSION,
    breakingParamCodes,
    canonicalJson,
    nextComparableFrom,
    paramsVersion,
    registryVersionOf,
} from './params-version';
export type {
    JsonArray,
    JsonObject,
    JsonPrimitive,
    JsonValue,
    ParamsVersionPayload,
} from './params-version';
