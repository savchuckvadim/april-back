/**
 * «Работа по сделке» (решения владельца 20.11.2026): разобранный звонок,
 * звонок из дел Битрикса (в том числе недозвон), созданное или закрытое
 * дело, задача, смена стадии. По ней делятся сделки дольше срока в стадии:
 * работа за окно есть — «Без продвижения», нет — «Без внимания».
 *
 * «Последняя активность» сделки (`LAST_ACTIVITY_TIME`) работой НЕ
 * считается: её сдвигают наши же записи в ленту, роботы и бизнес-процессы
 * (20.11.2026 ночью 211 сделок получили её от наших комментариев) — иначе
 * запись «работы нет» сама превращала бы сделку в «работа есть».
 *
 * Дни в текстах — по поясу портала. Чистые функции: момент расчёта
 * приходит в шкале.
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

/** Форматы дня по поясам: создавать на каждый момент дорого. */
const DAY_FORMATS = new Map<string, Intl.DateTimeFormat>();

/**
 * 'YYYY-MM-DD' момента по поясу портала (IANA): звонок в 23:30 UTC — это
 * уже следующий день по Москве. Пояс не разобрать — день по UTC.
 */
export function dealMovementDayOf(atMs: number, timeZone: string): string {
    let format = DAY_FORMATS.get(timeZone);
    if (format === undefined) {
        try {
            format = new Intl.DateTimeFormat('en-CA', {
                timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            });
        } catch {
            return new Date(atMs).toISOString().slice(0, 10);
        }
        DAY_FORMATS.set(timeZone, format);
    }
    return format.format(atMs);
}

/**
 * Работа за окно словами для причины «Без продвижения»: дни звонков
 * (разобранных и из дел; недозвоны — пометкой, если все звонки такие),
 * дела, задачи, смены стадии — по поясу портала. Работы за окно нет —
 * null: это и есть «Без внимания» у сделки дольше срока в стадии.
 */
export function recentWorkOf(
    dossier: DealMovementDossier,
    timeline: DealMovementTimeline,
    timeZone: string,
): DealMovementRecentWork | null {
    const fresh = (atMs: number): boolean =>
        inWindow(timeline, atMs) && atMs <= timeline.nowMs;
    const daysOf = (moments: readonly number[]): string[] => [
        ...new Set(
            [...moments]
                .sort((a, b) => a - b)
                .map(atMs => dealMovementDayOf(atMs, timeZone)),
        ),
    ];
    const work = timedWork(dossier).filter(item => fresh(item.atMs));
    const workCalls = work.filter(item => item.kind === 'call');
    const analyzed = timeline.calls.filter(call => fresh(call.atMs));
    const stageMoments = timeline.transitions
        .filter(item => fresh(item.atMs))
        .map(item => item.atMs);
    // Вход в стадию за окном без истории — тоже смена стадии.
    if (
        stageMoments.length === 0 &&
        timeline.stageEnteredMs !== null &&
        fresh(timeline.stageEnteredMs)
    ) {
        stageMoments.push(timeline.stageEnteredMs);
    }
    const recent: DealMovementRecentWork = {
        callDays: daysOf([
            ...analyzed.map(call => call.atMs),
            ...workCalls.map(item => item.atMs),
        ]),
        // Разобранный звонок — всегда разговор, не недозвон.
        callsMissed:
            analyzed.length === 0 &&
            workCalls.length > 0 &&
            workCalls.every(item => item.missed),
        activityDays: daysOf(
            work
                .filter(item => item.kind === 'activity')
                .map(item => item.atMs),
        ),
        taskDays: daysOf(
            work.filter(item => item.kind === 'task').map(item => item.atMs),
        ),
        stageDays: daysOf(stageMoments),
    };
    const listed =
        recent.callDays.length +
        recent.activityDays.length +
        recent.taskDays.length +
        recent.stageDays.length;
    return listed > 0 ? recent : null;
}
