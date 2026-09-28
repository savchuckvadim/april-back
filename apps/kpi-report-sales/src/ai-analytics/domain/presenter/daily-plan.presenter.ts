/**
 * Презентер плана дня (план Фазы 2, §5.2, поток 17): собранный вид →
 * DTO ручки `POST ai-analytics/plan/daily`.
 *
 * Две ответственности и обе — раскладка, без математики:
 * 1. Периметр отдачи: `ropOnly` (нормы, связь качества, два `G′`,
 *    связующее ограничение) уходит только руководителям
 *    (`AI_ANALYTICS_LEADER_ROLES`); менеджер получает план без него.
 * 2. Объяснение словами — `daily-plan-explanation.presenter.ts`: шаги в
 *    порядке расчёта, числа шагов из самого DTO.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()`.
 */
import type { DailyPlanItem } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_LEADER_ROLES } from '../../constants/ai-analytics.const';
import { AI_ANALYTICS_FUNNEL_EDGES } from '../../constants/ai-overview.const';
import type {
    AiDailyPlanDto,
    AiDailyPlanItemDto,
    AiDailyPlanRopOnlyDto,
} from '../../dto/ai-daily-plan.dto';
import type { DailyPlanView } from '../assembler/daily-plan-input.types';
import type { RequesterAccess } from '../access/perimeter.util';
import { buildDailyPlanExplanation } from './daily-plan-explanation.presenter';

/** Название типа активности по коду ребра; неизвестный код — сам код. */
export function planItemTitle(callType: string): string {
    return (
        AI_ANALYTICS_FUNNEL_EDGES.find(edge => edge.code === callType)?.title ??
        callType
    );
}

/** Строка плана: то же, что посчитала модель, плюс название для витрины. */
function toItemDto(item: DailyPlanItem): AiDailyPlanItemDto {
    return {
        callType: item.callType,
        title: planItemTitle(item.callType),
        requiredToday: item.requiredToday,
        doneToday: item.doneToday,
        monthPlan: item.monthPlan,
        monthDone: item.monthDone,
        cap: item.cap,
        priority: item.priority,
    };
}

/**
 * План дня в DTO. `access` решает только одно — отдавать ли `ropOnly`:
 * сами числа посчитаны заранее и от роли не зависят, поэтому кэш плана
 * один на менеджера и день.
 */
export function presentDailyPlan(
    view: DailyPlanView,
    access: RequesterAccess,
): AiDailyPlanDto {
    const items = view.plan.items.map(toItemDto);
    const dto: AiDailyPlanDto = {
        managerId: view.managerId,
        date: view.date,
        target: {
            sales: view.target.value,
            source: view.target.source,
            warnings: [...view.target.warnings],
        },
        doneSales: view.doneSales,
        pipelineExpected: view.pipelineExpected,
        requiredVolume: view.requiredVolume,
        daysLeft: view.daysLeft,
        items,
        explanation: buildDailyPlanExplanation(view, items),
        reason: view.reason,
    };

    return isLeader(access) ? { ...dto, ropOnly: toRopOnlyDto(view) } : dto;
}

/** Руководитель ли смотрит план (cup|op|group). */
function isLeader(access: RequesterAccess): boolean {
    return (AI_ANALYTICS_LEADER_ROLES as readonly string[]).includes(
        access.role,
    );
}

/** Служебный блок руководителя: пустые значения не отдаются вовсе. */
function toRopOnlyDto(view: DailyPlanView): AiDailyPlanRopOnlyDto {
    const { rop } = view;

    return {
        norm: rop.norm,
        normAtRefQuality: rop.normAtRefQuality,
        betaSource: rop.betaSource,
        ...(rop.bindingConstraint === null
            ? {}
            : { bindingConstraint: rop.bindingConstraint }),
        ...(rop.unreachable === null ? {} : { unreachable: rop.unreachable }),
        gExpected: rop.gExpected,
        gCeiling: rop.gCeiling,
        ...(rop.sReq === null ? {} : { sReq: rop.sReq }),
    };
}
