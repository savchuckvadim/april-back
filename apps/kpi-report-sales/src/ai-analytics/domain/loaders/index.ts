/**
 * Loader'ы AI-аналитики по источникам (план, 6.1): звонки (call-lib),
 * настройки и ростер порталов, ссылки на смарт, а с Фазы 1b — KPI-слой,
 * финансовый хвост и планы руководителя. Overview-use-case собирает
 * матрицу из их результатов.
 */
export { CallsLoader } from './calls.loader';
export { SettingsLoader } from './settings.loader';
export type { AiAnalyticsPortalSettings } from './settings.loader';
export { AiAnalyticsPortalsLoader } from './portals.loader';
export { SmartLinkLoader } from './smart-link.loader';

export { ManagersLoader, normalizeManagerIds } from './managers.loader';

export { KpiLoader } from './kpi.loader';
export { KpiMonthCalculator } from './kpi-month.calculator';
export { CALL_DONE_MERGED_EVENT_TYPE_CODES } from './kpi-month.assembler';
export {
    KpiListConfigError,
    resolveKpiListFields,
    SALES_KPI_LIST_CODE,
} from './kpi-list-fields.util';
export type { KpiListFields } from './kpi-list-fields.util';
export type {
    AiKpiChecks,
    AiKpiCodeFact,
    AiKpiDocuments,
    AiKpiLoadOptions,
    AiKpiManagerMonth,
    AiKpiMonth,
    AiKpiMonthsResult,
    AiKpiOutcomes,
    AiKpiPlanFact,
    AiKpiTypeFact,
} from './kpi.types';

export { FinanceLoader } from './finance.loader';
export { SalesFinanceUseCaseFactory } from './sales-finance-use-case.factory';
export type {
    AiFinanceClosedTotals,
    AiFinanceHotByColor,
    AiFinanceLoadOptions,
    AiFinanceManagerMonth,
    AiFinanceManagerPipeline,
    AiFinanceManagerSummary,
    AiFinanceMonth,
    AiFinancePipeline,
    AiFinancePipelineByContractType,
    AiFinancePipelineByTerm,
    AiFinancePipelineFacts,
    AiFinancePipelineResult,
    AiFinanceResult,
} from './finance.types';

export { PlansLoader } from './plans.loader';
export type {
    AiPlanManagerTargets,
    AiPlansLoadOptions,
    AiPlansResult,
} from './plans.types';

export {
    AI_ANALYTICS_LOADER_CACHE_SECTIONS,
    AI_ANALYTICS_CLOSED_MONTH_TTL_SECONDS,
    AI_ANALYTICS_LIVE_TTL_SECONDS,
    AI_ANALYTICS_PLANS_TTL_SECONDS,
    buildKpiMonthKey,
    buildFinanceMonthKey,
    buildFinancePipelineKey,
    buildPlansKey,
    buildManagersKey,
    monthSegmentTtlSeconds,
} from './loader-cache-key.util';

// Фаза 2, волна 4: история стадий воронки (курсор >ID, окна по месяцам,
// маппинг в переходы только по лестнице PBX_DEAL_SALES_BASE_STAGES),
// сущности звонков из записей ais и паспорт менеджера (каскад since,
// статус, полоса стажа). Шаги конвейера берут их из своих модулей срезов,
// барель нужен соседним модулям и тестам.
export { StageHistoryLoader, monthWindows } from './stage-history.loader';
export type {
    StageHistoryLoadOptions,
    StageHistoryResult,
    StageHistoryWindowOptions,
} from './stage-history.contract';
export {
    buildSalesBaseStageDict,
    salesBaseCategoryOf,
    toStageTransitions,
    toStageTransitionsByDict,
} from './stage-history.mapper';
export type {
    SalesBaseStage,
    SalesBaseStageDict,
    StageHistoryPortal,
} from './stage-history.mapper';

export {
    AI_CALL_ENTITY_CHUNK,
    CallEntityLoader,
    toCallEntityRef,
    toCallEntityType,
} from './call-entity.loader';
export type { CallEntityRef } from './call-entity.loader';

export { ManagerPassportLoader } from './manager-passport.loader';
export type {
    ManagerPassportLoadOptions,
    ManagerPassportResult,
} from './manager-passport.loader';
export {
    buildPassport,
    isActiveValue,
    resolveSince,
    resolveStatus,
    toPassportDate,
    toUserFacts,
} from './manager-passport.util';
export type {
    BuildPassportInput,
    ManagerUserFacts,
} from './manager-passport.util';
