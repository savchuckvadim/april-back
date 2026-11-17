/**
 * Статус открытой сделки по досье. Правила — раздел 4 постановки с
 * уточнениями 17.11.2026; порядок проверки: откатилась → застряла → под
 * риском → движется, первое сработавшее. Чистые функции: момент расчёта
 * приходит параметром. Временная шкала и её выводы —
 * `deal-movement.timeline.ts`.
 */
import {
    daysFrom,
    daysSinceAgreedOf,
    inWindow,
    isForwardTransition,
    isRolledBack,
    lastScoredCall,
    stepStateOf,
    timelineOf,
    timeOf,
    type DealMovementStepState,
    type DealMovementTimeline,
} from './deal-movement.timeline';
import {
    DEAL_MOVEMENT_DEFAULTS,
    type DealMovementDossier,
    type DealMovementFacts,
    type DealMovementReason,
    type DealMovementStatus,
    type DealMovementThresholds,
    type DealMovementVerdict,
} from './deal-movement.types';

/** Продвижение по звонку: «ничего не изменилось» и «сделка продвинулась». */
const PROGRESS_NOTHING = 1;
const PROGRESS_OK_MIN = 3;

function riskReasons(
    dossier: DealMovementDossier,
    timeline: DealMovementTimeline,
    thresholds: DealMovementThresholds,
    step: DealMovementStepState,
    daysSinceAgreed: number | null,
): DealMovementReason[] {
    const reasons: DealMovementReason[] = [];
    if (step.overdue) reasons.push('step_overdue');

    const scored = timeline.calls.filter(call => call.progress !== null);
    const lastTwo = scored.slice(-2);
    if (
        lastTwo.length === 2 &&
        lastTwo.every(call => call.progress === PROGRESS_NOTHING)
    ) {
        reasons.push('progress_low_twice');
    }
    if (
        daysSinceAgreed !== null &&
        daysSinceAgreed >= thresholds.agreedStillDays
    ) {
        reasons.push('agreed_but_still');
    }
    if (
        thresholds.chanceMin !== null &&
        thresholds.amountMin !== null &&
        dossier.stageChance !== null &&
        dossier.amount !== null &&
        dossier.stageChance < thresholds.chanceMin &&
        dossier.amount >= thresholds.amountMin
    ) {
        reasons.push('low_chance_big_sum');
    }
    if (dossier.forgotten === true) reasons.push('forgotten');
    return reasons;
}

/**
 * Работали ли со сделкой в окне: разобранный звонок или любая активность
 * по сделке (`LAST_ACTIVITY_TIME`). Разобраны не все звонки (пилот,
 * записи), поэтому одних звонков для «застряла» мало (решение 17.11.2026).
 */
function workedInWindow(
    dossier: DealMovementDossier,
    timeline: DealMovementTimeline,
): boolean {
    if (timeline.calls.some(call => inWindow(timeline, call.atMs))) {
        return true;
    }
    const activityMs =
        dossier.lastActivityAt === null ? null : timeOf(dossier.lastActivityAt);
    return activityMs !== null && inWindow(timeline, activityMs);
}

function movingReasons(
    timeline: DealMovementTimeline,
    step: DealMovementStepState,
): DealMovementReason[] {
    const moving: DealMovementReason[] = [];
    if (
        timeline.transitions.some(
            item => isForwardTransition(item) && inWindow(timeline, item.atMs),
        )
    ) {
        moving.push('stage_forward');
    }
    const lastCall = timeline.calls.at(-1);
    if (
        lastCall &&
        inWindow(timeline, lastCall.atMs) &&
        (lastCall.progress ?? 0) >= PROGRESS_OK_MIN
    ) {
        moving.push('progress_ok');
    }
    if (step.done) moving.push('step_done');
    return moving.length > 0 ? moving : ['no_signals'];
}

/**
 * @param dossier досье открытой сделки
 * @param now момент расчёта, ISO 8601
 * @param thresholds пороги портала; не заданы — значения по умолчанию
 */
export function dealMovementVerdict(
    dossier: DealMovementDossier,
    now: string,
    thresholds: DealMovementThresholds = DEAL_MOVEMENT_DEFAULTS,
): DealMovementVerdict {
    const nowMs = timeOf(now) ?? 0;
    const timeline = timelineOf(dossier, nowMs, thresholds.windowDays);
    const step = stepStateOf(timeline);
    const daysSinceAgreed = daysSinceAgreedOf(timeline);
    const facts: DealMovementFacts = {
        daysInStage: daysFrom(dossier.stageEnteredAt, nowMs),
        stageLimitDays: dossier.stageNormDays ?? thresholds.stuckDefaultDays,
        stepDate: step.date,
        lastProgress: lastScoredCall(timeline)?.progress ?? null,
        daysSinceAgreed,
    };
    const verdict = (
        status: DealMovementStatus,
        reasons: DealMovementReason[],
    ): DealMovementVerdict => ({
        dealId: dossier.dealId,
        status,
        reasons,
        facts,
    });

    // 1. Откатилась: ступень ниже самой высокой, на которой стояла в окне.
    if (isRolledBack(timeline, dossier.stageOrder)) {
        return verdict('rolled_back', ['stage_back']);
    }
    // 2. Застряла: в стадии дольше срока и работы за окно не было.
    if (
        facts.daysInStage > facts.stageLimitDays &&
        !workedInWindow(dossier, timeline)
    ) {
        return verdict('stuck', ['stage_overdue']);
    }
    // 3. Под риском: хотя бы один признак.
    const risks = riskReasons(
        dossier,
        timeline,
        thresholds,
        step,
        daysSinceAgreed,
    );
    if (risks.length > 0) return verdict('at_risk', risks);

    // 4. Движется: всё остальное.
    return verdict('moving', movingReasons(timeline, step));
}

/** Статус сменился — только тогда пишем в сделку и просим текст у модели. */
export function isDealMovementChanged(
    previous: DealMovementStatus | null,
    next: DealMovementStatus,
): boolean {
    return previous !== next;
}
