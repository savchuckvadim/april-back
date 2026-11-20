/**
 * Временная шкала досье сделки: разобранные звонки, переходы стадий и
 * контакты, упорядоченные по времени, — и выводы по ней: откат стадии,
 * судьба последней договорённости, согласие клиента без движения стадии.
 * Чистые функции: момент расчёта приходит параметром.
 */
import { PBX_DEAL_SALES_BASE_WON_ORDER } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type {
    DealMovementCall,
    DealMovementDossier,
    DealMovementTransition,
} from './deal-movement.types';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Продвижение по звонку «принципиальное согласие» — от 4 из 5. */
const PROGRESS_AGREED_MIN = 4;

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/;

export const timeOf = (iso: string): number | null => {
    const time = Date.parse(iso);
    return Number.isNaN(time) ? null : time;
};

/** Полных дней между моментами; дату не разобрать — 0. */
export const daysFrom = (fromIso: string, nowMs: number): number => {
    const from = timeOf(fromIso);
    return from === null ? 0 : Math.max(0, Math.floor((nowMs - from) / DAY_MS));
};

/**
 * Открытая ступень лестницы «ОП Основная»: ниже «Успеха». Успех, провал и
 * прочие финалы стоят от него и выше (`PBX_DEAL_SALES_BASE_WON_ORDER`).
 */
export const isOpenOrder = (order: number): boolean =>
    order > 0 && order < PBX_DEAL_SALES_BASE_WON_ORDER;

type TimedCall = DealMovementCall & { atMs: number };
type TimedTransition = Omit<DealMovementTransition, 'at'> & { atMs: number };

export interface DealMovementTimeline {
    nowMs: number;
    windowStartMs: number;
    /** Вход в текущую стадию; null — дату не разобрать. */
    stageEnteredMs: number | null;
    /** Разборы звонков по времени, свежие последними. */
    calls: TimedCall[];
    /** Переходы стадий по времени (переход на ту же стадию отброшен). */
    transitions: TimedTransition[];
    /** Прочие контакты по сделке (дела, активность). */
    closedMs: number[];
}

export function timelineOf(
    dossier: DealMovementDossier,
    nowMs: number,
    windowDays: number,
): DealMovementTimeline {
    return {
        nowMs,
        windowStartMs: nowMs - windowDays * DAY_MS,
        stageEnteredMs: timeOf(dossier.stageEnteredAt),
        calls: dossier.calls
            .flatMap(call => {
                const atMs = timeOf(call.at);
                return atMs === null ? [] : [{ ...call, atMs }];
            })
            .sort((a, b) => a.atMs - b.atMs),
        transitions: dossier.transitions
            .flatMap(transition => {
                const atMs = timeOf(transition.at);
                return atMs === null ||
                    transition.toOrder === transition.fromOrder
                    ? []
                    : [
                          {
                              atMs,
                              fromOrder: transition.fromOrder,
                              toOrder: transition.toOrder,
                          },
                      ];
            })
            .sort((a, b) => a.atMs - b.atMs),
        closedMs: dossier.closedActivitiesAt.flatMap(at => {
            const atMs = timeOf(at);
            return atMs === null ? [] : [atMs];
        }),
    };
}

export const inWindow = (
    timeline: DealMovementTimeline,
    atMs: number,
): boolean => atMs >= timeline.windowStartMs;

/** Переход вперёд между открытыми стадиями (переоткрытие — не продвижение). */
export const isForwardTransition = (transition: TimedTransition): boolean =>
    isOpenOrder(transition.fromOrder) &&
    isOpenOrder(transition.toOrder) &&
    transition.toOrder > transition.fromOrder;

/**
 * Вернулась назад: текущая ступень ниже самой высокой открытой ступени, на
 * которой сделка стояла в окне (решение 17.11.2026). Поэтому:
 * - повторная заявка (стадия → «Новая» → обратно) откатом не считается —
 *   сделка вернулась на прежнюю ступень;
 * - переход через закрытую стадию отбрасывается: переоткрытая сделка
 *   (провал → «Холодные») начинает отсчёт заново;
 * - «Доработка» после «Отправлены» — откат.
 */
export function isRolledBack(
    timeline: DealMovementTimeline,
    stageOrder: number | null,
): boolean {
    const current = stageOrder ?? timeline.transitions.at(-1)?.toOrder ?? null;
    if (current === null || !isOpenOrder(current)) return false;
    let peak: number | null = null;
    for (const transition of timeline.transitions) {
        if (!inWindow(timeline, transition.atMs)) continue;
        peak = isOpenOrder(transition.fromOrder)
            ? Math.max(peak ?? transition.fromOrder, transition.fromOrder)
            : null;
        if (isOpenOrder(transition.toOrder)) {
            peak = Math.max(peak ?? transition.toOrder, transition.toOrder);
        }
    }
    return peak !== null && current < peak;
}

/** Дата договорённости 'YYYY-MM-DD'; свободный текст вместо даты — null. */
const stepDateOf = (call: DealMovementCall): string | null => {
    if (!call.nextStep?.set || !call.nextStep.date) return null;
    return ISO_DATE.exec(call.nextStep.date)?.[1] ?? null;
};

/**
 * Конец дня договорённости: до него она ещё не просрочена. Сознательно по
 * UTC, а не по поясу портала (решение 17.11.2026): для Москвы это 03:00
 * следующего дня — небольшой запас перед «просрочено» нам на руку.
 */
const endOfDayMs = (date: string): number =>
    Date.parse(`${date}T00:00:00.000Z`) + DAY_MS;

/** Был ли контакт после момента: разобранный звонок или другое дело. */
const contactAfter = (
    timeline: DealMovementTimeline,
    afterMs: number,
): boolean =>
    timeline.calls.some(call => call.atMs > afterMs) ||
    timeline.closedMs.some(at => at > afterMs);

export interface DealMovementStepState {
    date: string | null;
    overdue: boolean;
    done: boolean;
}

/**
 * Последняя договорённость с датой: просрочена (дата прошла, контакта после
 * неё не было) или выполнена (контакт в день договорённости или позже).
 */
export function stepStateOf(
    timeline: DealMovementTimeline,
): DealMovementStepState {
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

/** Последняя оценка продвижения по разобранным звонкам. */
export const lastScoredCall = (
    timeline: DealMovementTimeline,
): TimedCall | undefined =>
    timeline.calls.filter(call => call.progress !== null).at(-1);

/**
 * Дней с последнего звонка, где клиент принципиально согласился (4–5), если
 * после него стадия не менялась; согласия не было или стадия сдвинулась —
 * null. Сдвиг виден и без истории стадий: вход в текущую стадию позже
 * звонка (историю читают только у сделок, сдвинутых за окно).
 */
export function daysSinceAgreedOf(
    timeline: DealMovementTimeline,
): number | null {
    const last = lastScoredCall(timeline);
    if (!last || (last.progress ?? 0) < PROGRESS_AGREED_MIN) return null;
    if (timeline.transitions.some(item => item.atMs > last.atMs)) return null;
    if (
        timeline.stageEnteredMs !== null &&
        timeline.stageEnteredMs > last.atMs
    ) {
        return null;
    }
    return Math.floor((timeline.nowMs - last.atMs) / DAY_MS);
}
