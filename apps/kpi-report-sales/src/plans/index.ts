export { PlansModule } from './plans.module';

// Публичный API фичи для соседних модулей (план AI-аналитики, 6.1):
// сервисы планов non-injectable (`new PlanTargetsService(bitrix)`),
// каталог показателей — единственный источник кодов планов. Конфиг
// портала (PlansConfigService) держит только prisma — AI-аналитика
// создаёт его вручную (PlansModule несёт контроллер, импортировать его
// нельзя — ai/rules/app-api-surface.md). Пересчёт плана на период и отбор
// включённых показателей — те же правила, что у фронтового блока «Планы».
export { PlanTargetsService } from './domain/plan-targets.service';
export { PlanUserFieldsService } from './domain/plan-user-fields.service';
export { PlansConfigService } from './services/plans-config.service';
export { planForRange, planMonthlyRate } from './domain/plan-period.util';
export { enabledPlanIndicators } from './domain/enabled-plan-indicators.util';
export type { EnabledPlanIndicator } from './domain/enabled-plan-indicators.util';
export {
    PLAN_FACT_SOURCE,
    PLAN_FACT_SOURCES,
    PLAN_INDICATORS,
    PLAN_INDICATOR_CODES,
    PLAN_INDICATOR_CODE_LIST,
    PLAN_PERIOD_TYPES,
    PLAN_UNITS,
    findPlanIndicator,
    planIndicatorUfName,
} from './constants/plan-indicators.const';
export type {
    PlanFactSource,
    PlanIndicatorCode,
    PlanIndicatorDef,
    PlanIndicatorSetting,
    PlanPeriodType,
    PlanUnit,
} from './constants/plan-indicators.const';
export type {
    PlanTargetValueDto,
    PlanUserTargetsDto,
} from './dto/plan-targets.dto';
