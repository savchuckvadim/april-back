/**
 * Презентер реконсиляции план-факт (план Фазы 3, поток П2): вид
 * ассемблера → DTO ручки, с отсечением строк вне периметра запросившего
 * и с подписями причин деградации.
 *
 * Периметр применяется здесь, а не в кэше: кэшируется расчёт по
 * запрошенному набору менеджеров, а видимость зависит от роли — иначе
 * ключ пришлось бы плодить на каждого пользователя (тот же приём, что у
 * обзора и плана дня).
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import type { PlanFactRow } from '@lib/sales-ai-analytics';
import {
    AI_PLAN_FACT_REASONS,
    AI_PLAN_FACT_REASON_TEXTS,
    type AiPlanFactReason,
} from '../../constants/ai-plan-fact.const';
import type {
    AiPlanFactDto,
    AiPlanFactManagerDto,
    AiPlanFactRowDto,
} from '../../dto/ai-plan-fact.dto';
import {
    isManagerVisible,
    type RequesterAccess,
} from '../access/perimeter.util';
import type { PlanFactView } from '../assembler/plan-fact.assembler';

/** Строка модели → строка DTO (копия: наружу не уезжают readonly-ссылки). */
export function presentRow(row: PlanFactRow): AiPlanFactRowDto {
    return {
        indicator: row.indicator,
        plan: row.plan,
        fact: row.fact,
        pace: row.pace,
        forecastP50: row.forecastP50,
        gap: row.gap,
        perDayNeeded: row.perDayNeeded,
        status: row.status,
        reasons: [...row.reasons],
    };
}

/** Причины деградации уровня ручки по виду и настройке портала. */
export function reasonsOf(
    view: PlanFactView,
    dailyPlanEnabled: boolean,
): AiPlanFactReason[] {
    const reasons: AiPlanFactReason[] = [];
    if (!view.hasPlanSnapshot) {
        reasons.push(AI_PLAN_FACT_REASONS.planSnapshotMissing);
    }
    if (!view.hasMonthSnapshots) {
        reasons.push(AI_PLAN_FACT_REASONS.monthSnapshotsMissing);
    }
    if (!dailyPlanEnabled) {
        reasons.push(AI_PLAN_FACT_REASONS.dailyPlanDisabled);
    }

    return reasons;
}

/** Реконсиляция наружу: строки периметра, свод отдела и причины. */
export function presentPlanFact(
    view: PlanFactView,
    access: RequesterAccess,
    options: { readonly today: string; readonly closed: boolean },
): AiPlanFactDto {
    const rows: AiPlanFactManagerDto[] = view.managers
        .filter(manager => isManagerVisible(access, manager.managerId))
        .map(manager => ({
            managerId: manager.managerId,
            rows: manager.rows.map(presentRow),
        }));
    const reasons = reasonsOf(view, view.exposure.dailyPlanEnabled !== false);

    return {
        period: {
            monthKey: view.monthKey,
            workdaysInMonth: view.exposure.workdaysInMonth,
            workdaysElapsed: view.exposure.workdaysElapsed,
            today: options.today,
            closed: options.closed,
        },
        rows,
        team: view.team.map(presentRow),
        reasons: [...reasons],
        reasonTexts: reasons.map(reason => AI_PLAN_FACT_REASON_TEXTS[reason]),
    };
}
