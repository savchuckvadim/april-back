/**
 * Путеводитель по AI-аналитике ОП: каталог разделов (чистые данные) и
 * админ-контроллер. Контроллер подключается только через
 * `SalesAiAnalyticsAdminModule` (apps/admin).
 */
export * from './ai-guide.types';
export * from './ai-guide.catalog';
export * from './ai-guide.links';
export * from './ai-guide.markdown';
export { AI_GUIDE_ENDPOINT } from './ai-guide.endpoints';
export type { AiGuideEndpointKey } from './ai-guide.endpoints';
export {
    AI_GUIDE_PARAM_GROUPS,
    AI_GUIDE_PARAM_GROUP_CODES,
    AI_GUIDE_PORTAL_AI_SETTING_TITLES,
    aiGuideParamGroupOf,
    findKpiSalesSetting,
    isAiGuideParamGroupCode,
} from './ai-guide.registry';
export type { AiGuideParamGroupCode } from './ai-guide.registry';
export {
    AiAnalyticsGuideAdminController,
    AI_GUIDE_ROUTES,
} from './ai-guide.admin.controller';
