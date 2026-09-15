/**
 * Типы входа и результата сборки плана дня (план Фазы 2, поток 17).
 *
 * Вынесены из `daily-plan-input.assembler.ts`, чтобы рабочие файлы
 * остались в пределах 300 строк (прецеденты — `forecast.types.ts`,
 * `model/daily-plan.types.ts` библиотеки). Все поля JSON-сериализуемы:
 * результат сборки кладётся в кэш плана дня целиком.
 */
import type {
    AiBetaSource,
    DailyPlan,
    MetricValue,
    TargetSource,
    WorkCalendar,
} from '@lib/sales-ai-analytics';
import type { AiTargets } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import type { ForecastPayload } from './forecast.types';
import type { ManagerMonthPayload } from './manager-snapshot.types';
import type { PortalModelPayload } from './portal-model.types';

/**
 * Снапшоты, из которых собирается план дня; null — записи нет и работает
 * штатная деградация (§5.4). Нагрузки читаются структурно (`Partial`):
 * чужая или неполная форма не должна ронять ручку.
 */
export interface DailyPlanSnapshots {
    /** `ai-analytics-forecast` за день менеджера. */
    readonly forecast: Partial<ForecastPayload> | null;
    /** `ai-analytics-portal-model` за месяц (или последняя записанная). */
    readonly model: Partial<PortalModelPayload> | null;
    /** `ai-analytics-manager-month` за месяц менеджера. */
    readonly month: Partial<ManagerMonthPayload> | null;
}

/** Вход сборки: кто, на какой день и что нашлось в `ais`. */
export interface DailyPlanAssembleInput {
    readonly managerId: string;
    /** День плана 'YYYY-MM-DD' в TZ портала. */
    readonly date: string;
    readonly monthKey: string;
    readonly calendar: WorkCalendar;
    /** Цели портала: по уровням и личные переопределения. */
    readonly targets: AiTargets;
    /**
     * `plan_day_ceiling` реестра, решённый настройками портала. Не задан —
     * дефолт библиотеки (1,5). Тот же множитель, что берёт ночной прогноз
     * (`forecast.plan.ts`): иначе план по объёму и план по нормам считали
     * бы потолок дня по разным правилам.
     */
    readonly ceilingMultiplier?: number;
    readonly snapshots: DailyPlanSnapshots;
}

/** Рабочие дни месяца: всего, прошло и осталось (включая сегодня). */
export interface DailyPlanWorkdays {
    readonly total: number;
    readonly elapsed: number;
    readonly left: number;
}

/** Числа, которые видит только руководитель (`ropOnly`). */
export interface DailyPlanRopFacts {
    /** Норма входного ребра менеджера; value = null — данных мало. */
    readonly norm: MetricValue;
    /** `p̂(S_ref)`; null — режим не `data`, связи качества нет. */
    readonly normAtRefQuality: number | null;
    readonly betaSource: AiBetaSource;
    /** Код ребра, упирающегося в capacity; null — не упирается. */
    readonly bindingConstraint: string | null;
    /** Почему цель недостижима; null — достижима. */
    readonly unreachable: string | null;
    /** `G′` по медиане темпа менеджера. */
    readonly gExpected: number;
    /** `G′` по потолку полосы `cap`. */
    readonly gCeiling: number;
    /** `S_req`; null — вне режима `data` числа нет. */
    readonly sReq: number | null;
}

/** Цель месяца, её источник и оговорки санити. */
export interface DailyPlanTargetFacts {
    readonly value: number;
    readonly source: TargetSource;
    readonly warnings: string[];
}

/** Собранный план дня до раскладки в DTO (он же — тело кэша). */
export interface DailyPlanView {
    readonly managerId: string;
    readonly date: string;
    readonly monthKey: string;
    readonly target: DailyPlanTargetFacts;
    /** `Y₀` — закрытые продажи месяца. */
    readonly doneSales: number;
    /** `λ_pipe`; null — истории стадий нет, цель не уменьшается. */
    readonly pipelineExpected: number | null;
    /**
     * `N_req` — требуемый объём входной активности до конца месяца;
     * null — план построен по объёму (`volumeBased`), обратную задачу
     * никто не решал, и ноль здесь читался бы как «делать нечего».
     */
    readonly requiredVolume: number | null;
    /** План посчитан по объёму (деградация §5.4), а не от цели через нормы. */
    readonly volumeBased: boolean;
    readonly daysLeft: number;
    readonly daysElapsed: number;
    readonly workdaysInMonth: number;
    readonly plan: DailyPlan;
    /** Код штатной деградации; null — посчитано по полным данным. */
    readonly reason: string | null;
    readonly rop: DailyPlanRopFacts;
}
