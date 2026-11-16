/**
 * Статус открытой сделки по досье. Правила — раздел 4 постановки; порядок
 * проверки: откатилась → застряла → под риском → движется, первое
 * сработавшее. Чистые функции: момент расчёта приходит параметром.
 */
import {
    DEAL_MOVEMENT_DEFAULTS,
    type DealMovementCall,
    type DealMovementDossier,
    type DealMovementFacts,
    type DealMovementReason,
    type DealMovementStatus,
    type DealMovementThresholds,
    type DealMovementVerdict,
} from './deal-movement.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Продвижение по звонку: «ничего не изменилось» и «принципиальное согласие». */
const PROGRESS_NOTHING = 1;
const PROGRESS_OK_MIN = 3;
const PROGRESS_AGREED_MIN = 4;

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

const timeOf = (iso: string): number | null => {
    const time = Date.parse(iso);
    return Number.isNaN(time) ? null : time;
};

/** Полных дней между моментами; дату не разобрать — 0. */
const daysFrom = (fromIso: string, nowMs: number): number => {
    const from = timeOf(fromIso);
    return from === null ? 0 : Math.max(0, Math.floor((nowMs - from) / DAY_MS));
};

/** Дата договорённости 'YYYY-MM-DD'; свободный текст вместо даты — null. */
const stepDateOf = (call: DealMovementCall): string | null => {
    if (!call.nextStep?.set || !call.nextStep.date) return null;
    return ISO_DATE.exec(call.nextStep.date)?.[1] ?? null;
};

/** Конец дня договорённости: до него она ещё не просрочена. */
const endOfDayMs = (date: string): number =>
    Date.parse(`${date}T00:00:00.000Z`) + DAY_MS;

interface Timeline {
    nowMs: number;
    windowStartMs: number;
    /** Разборы звонков по времени, свежие последними. */
    calls: (DealMovementCall & { atMs: number })[];
    transitions: { atMs: number; forward: boolean }[];
    closedMs: number[];
}

function timelineOf(
    dossier: DealMovementDossier,
    nowMs: number,
    windowDays: number,
): Timeline {
    return {
        nowMs,
        windowStartMs: nowMs - windowDays * DAY_MS,
        calls: dossier.calls
            .flatMap(call => {
                const atMs = timeOf(call.at);
                return atMs === null ? [] : [{ ...call, atMs }];
            })
            .sort((a, b) => a.atMs - b.atMs),
        transitions: dossier.transitions.flatMap(transition => {
            const atMs = timeOf(transition.at);
            return atMs === null || transition.toOrder === transition.fromOrder
                ? []
                : [
                      {
                          atMs,
                          forward: transition.toOrder > transition.fromOrder,
                      },
                  ];
        }),
        closedMs: dossier.closedActivitiesAt.flatMap(at => {
            const atMs = timeOf(at);
            return atMs === null ? [] : [atMs];
        }),
    };
}

/** Был ли контакт после момента: звонок или закрытое дело. */
const contactAfter = (timeline: Timeline, afterMs: number): boolean =>
    timeline.calls.some(call => call.atMs > afterMs) ||
    timeline.closedMs.some(at => at > afterMs);

/**
 * Последняя договорённость с датой: просрочена (дата прошла, контакта после
 * неё не было) или выполнена (контакт в день договорённости или позже).
 */
function stepStateOf(timeline: Timeline): {
    date: string | null;
    overdue: boolean;
    done: boolean;
} {
    for (let index = timeline.calls.length - 1; index >= 0; index--) {
        const call = timeline.calls[index];
        const date = stepDateOf(call);
        if (date === null) continue;
        const dueMs = endOfDayMs(date);
        const dayStartMs = dueMs - DAY_MS;
        // Сам звонок, где договорились, выполнением не считается — даже
        // если договорились «на сегодня».
        const met = contactAfter(timeline, Math.max(call.atMs, dayStartMs - 1));
        return {
            date,
            overdue: dueMs <= timeline.nowMs && !met,
            done: met && dayStartMs >= timeline.windowStartMs,
        };
    }
    return { date: null, overdue: false, done: false };
}

function riskReasons(
    dossier: DealMovementDossier,
    timeline: Timeline,
    thresholds: DealMovementThresholds,
    step: ReturnType<typeof stepStateOf>,
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
 * Дней с последнего звонка, где клиент принципиально согласился (4–5), если
 * после него стадия не менялась; согласия не было или стадия сдвинулась —
 * null.
 */
function daysSinceAgreedOf(timeline: Timeline): number | null {
    const last = timeline.calls.filter(call => call.progress !== null).at(-1);
    if (!last || (last.progress ?? 0) < PROGRESS_AGREED_MIN) return null;
    if (timeline.transitions.some(item => item.atMs > last.atMs)) return null;
    return Math.floor((timeline.nowMs - last.atMs) / DAY_MS);
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
    const inWindow = (atMs: number): boolean => atMs >= timeline.windowStartMs;
    const step = stepStateOf(timeline);
    const daysSinceAgreed = daysSinceAgreedOf(timeline);
    const lastProgress =
        timeline.calls.filter(call => call.progress !== null).at(-1)
            ?.progress ?? null;
    const facts: DealMovementFacts = {
        daysInStage: daysFrom(dossier.stageEnteredAt, nowMs),
        stageLimitDays: dossier.stageNormDays ?? thresholds.stuckDefaultDays,
        stepDate: step.date,
        lastProgress,
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

    // 1. Откатилась: стадия ушла назад за окно.
    if (
        timeline.transitions.some(item => !item.forward && inWindow(item.atMs))
    ) {
        return verdict('rolled_back', ['stage_back']);
    }
    // 2. Застряла: в стадии дольше обычного и звонков за окно нет.
    const callsInWindow = timeline.calls.some(call => inWindow(call.atMs));
    if (facts.daysInStage > facts.stageLimitDays && !callsInWindow) {
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
    const moving: DealMovementReason[] = [];
    if (
        timeline.transitions.some(item => item.forward && inWindow(item.atMs))
    ) {
        moving.push('stage_forward');
    }
    const lastCall = timeline.calls.at(-1);
    if (
        lastCall &&
        inWindow(lastCall.atMs) &&
        (lastCall.progress ?? 0) >= PROGRESS_OK_MIN
    ) {
        moving.push('progress_ok');
    }
    if (step.done) moving.push('step_done');
    return verdict('moving', moving.length > 0 ? moving : ['no_signals']);
}

/** Статус сменился — только тогда пишем в сделку и просим текст у модели. */
export function isDealMovementChanged(
    previous: DealMovementStatus | null,
    next: DealMovementStatus,
): boolean {
    return previous !== next;
}
