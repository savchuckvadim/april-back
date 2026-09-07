/**
 * Публичный API реестра параметров AI-аналитики ОП.
 *
 * Собственный barrel папки: корневой `src/index.ts` библиотеки подключает
 * его отдельно (интеграционный шаг), приложения импортируют только отсюда.
 * Внутренние части реестра (`registry.*.const`) наружу не торчат — состав
 * тем меняется чаще, чем публичный контракт.
 */
export * from './registry.types';
export {
    AI_ANALYTICS_PARAMS,
    AI_ANALYTICS_PARAM_CODES,
    AI_ANALYTICS_PARAM_DEFAULTS,
    findParam,
} from './registry.const';
export type { AiAnalyticsParamCode } from './registry.const';
export {
    HOT_CLIENT_DEFINITION_DEFAULT,
    HOT_CLIENT_STAGE_FROM_PREFIX,
} from './registry.definitions.const';
export { resolveParam, resolveNumberParam } from './resolve';
export {
    REGISTRY_VERSION,
    canonicalJson,
    paramsVersion,
} from './params-version';
export type {
    JsonArray,
    JsonObject,
    JsonPrimitive,
    JsonValue,
    ParamsVersionPayload,
} from './params-version';
