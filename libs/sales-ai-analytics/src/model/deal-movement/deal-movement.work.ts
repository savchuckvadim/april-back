/**
 * «Работа по сделке» (решение владельца 20.11.2026): любой звонок (в том
 * числе недозвон), созданное или закрытое дело, задача, смена стадии,
 * активность по сделке. По ней делятся сделки дольше срока в стадии:
 * работа за окно есть — «Без продвижения», нет — «Без внимания». Чистые
 * функции: момент расчёта приходит в шкале.
 */
import {
    DAY_MS,
    inWindow,
    timeOf,
    type DealMovementTimeline,
} from './deal-movement.timeline';
import type {
    DealMovementDossier,
    DealMovementRecentWork,
    DealMovementWork,
} from './deal-movement.types';

type TimedWork = DealMovementWork & { atMs: number };

const timedWork = (dossier: DealMovementDossier): TimedWork[] =>
    dossier.work
        .flatMap(item => {
            const atMs = timeOf(item.at);
            return atMs === null ? [] : [{ ...item, atMs }];
        })
        .sort((a, b) => a.atMs - b.atMs);

/** Все известные моменты работы по сделке, мс. */
function workMoments(
    dossier: DealMovementDossier,
    timeline: DealMovementTimeline,
): number[] {
    const moments = [
        ...timeline.calls.map(call => call.atMs),
        ...timeline.transitions.map(item => item.atMs),
        ...timedWork(dossier).map(item => item.atMs),
    ];
    const activityMs =
        dossier.lastActivityAt === null ? null : timeOf(dossier.lastActivityAt);
    if (activityMs !== null) moments.push(activityMs);
    // Вход в текущую стадию — тоже смена стадии, даже без истории.
    if (timeline.stageEnteredMs !== null) moments.push(timeline.stageEnteredMs);
    return moments.filter(atMs => atMs <= timeline.nowMs);
}

/** Дней без работы по сделке; моментов нет — null. */
export function idleDaysOf(
    dossier: DealMovementDossier,
    timeline: DealMovementTimeline,
): number | null {
    const moments = workMoments(dossier, timeline);
    if (moments.length === 0) return null;
    return Math.max(
        0,
        Math.floor((timeline.nowMs - Math.max(...moments)) / DAY_MS),
    );
}

/** 'YYYY-MM-DD' момента (по UTC, как сроки договорённостей). */
const dayOf = (atMs: number): string =>
    new Date(atMs).toISOString().slice(0, 10);

const uniqueDays = (moments: readonly number[]): string[] => [
    ...new Set([...moments].sort((a, b) => a - b).map(dayOf)),
];

/**
 * Работа за окно словами для причины «Без продвижения»: дни звонков
 * (разобранных и из дел; недозвоны — пометкой, если все звонки такие),
 * дела, задачи, смены стадии. Ничего из этого нет, а активность по сделке
 * за окно была — её день. Работы за окно нет — null: это и есть «Без
 * внимания» у сделки дольше срока в стадии.
 */
export function recentWorkOf(
    dossier: DealMovementDossier,
    timeline: DealMovementTimeline,
): DealMovementRecentWork | null {
    const fresh = (atMs: number): boolean =>
        inWindow(timeline, atMs) && atMs <= timeline.nowMs;
    const work = timedWork(dossier).filter(item => fresh(item.atMs));
    const workCalls = work.filter(item => item.kind === 'call');
    const analyzed = timeline.calls.filter(call => fresh(call.atMs));
    const callDays = uniqueDays([
        ...analyzed.map(call => call.atMs),
        ...workCalls.map(item => item.atMs),
    ]);
    const recent: DealMovementRecentWork = {
        callDays,
        // Разобранный звонок — всегда разговор, не недозвон.
        callsMissed:
            callDays.length > 0 &&
            analyzed.length === 0 &&
            workCalls.every(item => item.missed),
        activityDays: uniqueDays(
            work
                .filter(item => item.kind === 'activity')
                .map(item => item.atMs),
        ),
        taskDays: uniqueDays(
            work.filter(item => item.kind === 'task').map(item => item.atMs),
        ),
        stageDays: uniqueDays(
            timeline.transitions
                .filter(item => fresh(item.atMs))
                .map(item => item.atMs),
        ),
        activityOnly: null,
    };
    const listed =
        recent.callDays.length +
        recent.activityDays.length +
        recent.taskDays.length +
        recent.stageDays.length;
    if (listed > 0) return recent;
    const activityMs =
        dossier.lastActivityAt === null ? null : timeOf(dossier.lastActivityAt);
    if (activityMs !== null && fresh(activityMs)) {
        return { ...recent, activityOnly: dayOf(activityMs) };
    }
    if (timeline.stageEnteredMs !== null && fresh(timeline.stageEnteredMs)) {
        return { ...recent, stageDays: [dayOf(timeline.stageEnteredMs)] };
    }
    return null;
}
