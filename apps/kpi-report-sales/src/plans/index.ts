export { PlansModule } from './plans.module';

// Публичный API фичи для соседних модулей (план AI-аналитики, 6.1):
// сервисы планов non-injectable (`new PlanTargetsService(bitrix)`),
// каталог показателей — единственный источник кодов планов.
export { PlanTargetsService } from './domain/plan-targets.service';
export { PlanUserFieldsService } from './domain/plan-user-fields.service';
export {
    PLAN_INDICATORS,
    PLAN_INDICATOR_CODES,
    PLAN_INDICATOR_CODE_LIST,
    findPlanIndicator,
    planIndicatorUfName,
} from './constants/plan-indicators.const';
export type {
    PlanIndicatorCode,
    PlanIndicatorDef,
} from './constants/plan-indicators.const';
export type {
    PlanTargetValueDto,
    PlanUserTargetsDto,
} from './dto/plan-targets.dto';
