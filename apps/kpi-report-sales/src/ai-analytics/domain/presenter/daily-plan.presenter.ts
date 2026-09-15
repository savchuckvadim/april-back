/**
 * Презентер плана дня (план Фазы 2, §5.2, поток 17): собранный вид →
 * DTO ручки `POST ai-analytics/plan/daily`.
 *
 * Две ответственности и обе — раскладка, без математики:
 * 1. Периметр отдачи: `ropOnly` (нормы, связь качества, два `G′`,
 *    связующее ограничение) уходит только руководителям
 *    (`AI_ANALYTICS_LEADER_ROLES`); менеджер получает план без него.
 * 2. Объяснение: шаги строго в порядке расчёта
 *    `G → Y₀ → λ_pipe → N_req → разворот → потолок`, и число каждого шага
 *    берётся ИЗ САМОГО DTO — так объяснение нельзя разойтись с планом.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()`.
 */
import type { DailyPlanItem } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_LEADER_ROLES } from '../../constants/ai-analytics.const';
import { AI_ANALYTICS_FUNNEL_EDGES } from '../../constants/ai-overview.const';
import {
    AI_DAILY_PLAN_REASON_TEXTS,
    AI_DAILY_PLAN_STEP_CODES,
} from '../../constants/ai-plan.const';
import type {
    AiDailyPlanDto,
    AiDailyPlanItemDto,
    AiDailyPlanRopOnlyDto,
    AiDailyPlanStepDto,
} from '../../dto/ai-daily-plan.dto';
import type { DailyPlanView } from '../assembler/daily-plan-input.types';
import type { RequesterAccess } from '../access/perimeter.util';

/** Число с одной десятичной и запятой — как в текстах модели. */
const ru1 = (value: number): string => value.toFixed(1).replace('.', ',');

/** Подписи источников цели для текста объяснения. */
const TARGET_SOURCE_TEXTS = {
    plan: 'план руководителя',
    levelTarget: 'цель уровня',
    median: 'медиана полосы стажа',
} as const;

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

/** Шаги `G` и `Y₀` — начало цепочки объяснения. */
function goalSteps(view: DailyPlanView): AiDailyPlanStepDto[] {
    const source = TARGET_SOURCE_TEXTS[view.target.source];

    return [
        {
            code: AI_DAILY_PLAN_STEP_CODES.target,
            value: view.target.value,
            text: `Цель месяца G: ${ru1(view.target.value)} (источник — ${source}).`,
        },
        {
            code: AI_DAILY_PLAN_STEP_CODES.doneSales,
            value: view.doneSales,
            text: `Уже закрыто в месяце Y₀: ${ru1(view.doneSales)}.`,
        },
    ];
}

/**
 * Шаги `λ_pipe` и `N_req` — что осталось взять объёмом. В деградации
 * (`volumeBased`) обратную задачу никто не решал: оба числа равны null, а
 * текст называет настоящую причину — иначе шаг «N_req: 0,0» противоречил
 * бы непустым строкам плана.
 */
function volumeSteps(view: DailyPlanView): AiDailyPlanStepDto[] {
    const pipelineText = view.volumeBased
        ? 'Ожидание от открытого пайплайна λ_pipe не считаем: дневного ' +
          'прогноза за эту дату нет — цель на него не уменьшаем.'
        : 'Ожидание от открытого пайплайна λ_pipe не считаем: истории ' +
          'стадий нет — цель на него не уменьшаем.';

    return [
        {
            code: AI_DAILY_PLAN_STEP_CODES.pipeline,
            value: view.pipelineExpected,
            text:
                view.pipelineExpected === null
                    ? pipelineText
                    : `От открытого пайплайна ожидаем λ_pipe: ${ru1(view.pipelineExpected)}.`,
        },
        {
            code: AI_DAILY_PLAN_STEP_CODES.requiredVolume,
            value: view.requiredVolume,
            text:
                view.requiredVolume === null
                    ? 'Требуемый объём N_req по нормам не считаем: план ' +
                      'построен по объёму — остаток месяца берём из плана ' +
                      'руководителя, а без него из темпа отработанных дней.'
                    : `Нужно входной активности до конца месяца N_req: ` +
                      `${ru1(view.requiredVolume)} — остаток цели делится ` +
                      'на конверсию воронки и среднюю зрелость F̄.',
        },
    ];
}

/** Шаги разворота по рёбрам и потолка дня — то, что видно в строках. */
function planSteps(items: readonly AiDailyPlanItemDto[]): AiDailyPlanStepDto[] {
    const first = items[0];
    const unwind = items
        .map(item => `${item.title} — ${ru1(item.monthPlan)}`)
        .join('; ');

    return [
        {
            code: AI_DAILY_PLAN_STEP_CODES.unwind,
            value: first === undefined ? null : first.monthPlan,
            text:
                items.length === 0
                    ? 'Разворот по воронке не построен: строк плана нет.'
                    : `Разворот по воронке N_k = N_{k+1}/E[θ]: ${unwind}.`,
        },
        {
            code: AI_DAILY_PLAN_STEP_CODES.ceiling,
            value: first === undefined ? null : first.requiredToday,
            text:
                first === undefined
                    ? 'Потолок дня применять не к чему: строк плана нет.'
                    : `Остаток месяца делим на оставшиеся рабочие дни и ` +
                      `ограничиваем потолком дня: ${first.title} — ` +
                      `${ru1(first.requiredToday)} на сегодня.`,
        },
    ];
}

/**
 * Причина деградации словами — хвост текста объяснения. Незнакомый код
 * (старая запись в кэше) остаётся без подписи, но не превращает текст в
 * «undefined»: объяснение читает человек.
 */
function tailText(view: DailyPlanView): string {
    if (view.reason === null) return '';
    const texts: Partial<Record<string, string>> = AI_DAILY_PLAN_REASON_TEXTS;
    const text = texts[view.reason];

    return text === undefined ? '' : `${text}.`;
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
    const steps = [
        ...goalSteps(view),
        ...volumeSteps(view),
        ...planSteps(items),
    ];
    const tail = tailText(view);
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
        explanation: {
            steps,
            text: [...steps.map(step => step.text), tail]
                .filter(part => part.length > 0)
                .join(' '),
        },
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
