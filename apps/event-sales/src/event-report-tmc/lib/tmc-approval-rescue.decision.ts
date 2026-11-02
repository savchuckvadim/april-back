/**
 * Метка попыток подстраховки по элементу РПА (AppCache, 30 дней): сколько
 * раз крон ставил согласование и когда в последний раз.
 */
export interface TmcApprovalAttemptMarker {
    attempts: number;
    /** ISO-момент последней попытки. */
    lastAt: string;
    operationId?: string;
}

/** Что крон знает о заявке перед решением. */
export interface TmcApprovalRescueCandidate {
    /** Момент утверждения (перевода в стадию); null — Bitrix его не отдал. */
    movedAt: Date | null;
    /** Презентация по заявке уже запланирована (по ТМЦ-сделке). */
    processed: boolean;
    marker: TmcApprovalAttemptMarker | null;
}

/** Пороги прогона — считаются один раз на тик. */
export interface TmcApprovalRescueThresholds {
    now: Date;
    /** Сколько минут после утверждения робот дозванивается сам. */
    graceMinutes: number;
    maxAttempts: number;
    /** Пауза перед повтором после n-й попытки (минуты), индекс = n − 1. */
    backoffMinutes: readonly number[];
}

export type TmcApprovalRescueReason =
    /** Робот не дозвонился — планируем презентацию. */
    | 'dispatch'
    /** Нет времени перевода в стадию — пауза роботу не измерима. */
    | 'no-moved-time'
    /** Утверждена только что — роботу дано время самому. */
    | 'too-fresh'
    /** Презентация по заявке уже запланирована. */
    | 'processed'
    /** Попытки исчерпаны — дальше вручную. */
    | 'attempts-exhausted'
    /** Предыдущая попытка недавно — ждём перед повтором. */
    | 'backoff';

export interface TmcApprovalRescueDecision {
    action: 'dispatch' | 'skip';
    reason: TmcApprovalRescueReason;
}

/** После третьей попытки заявку оставляем людям: очередь исправно падает не просто так. */
export const TMC_APPROVAL_MAX_ATTEMPTS = 3;

/**
 * Пауза перед повтором: после первой попытки — час (статус операции в
 * Redis живёт столько же, раньше повтор вернул бы «уже принята»), после
 * второй — шесть часов.
 */
export const TMC_APPROVAL_BACKOFF_MINUTES: readonly number[] = [60, 360];

export const TMC_APPROVAL_REASON_TEXT: Record<TmcApprovalRescueReason, string> =
    {
        dispatch: 'робот не дозвонился — планируем презентацию',
        'no-moved-time': 'нет времени утверждения — паузу роботу не отмерить',
        'too-fresh': 'утверждена только что — роботу дано время самому',
        processed: 'презентация по заявке уже запланирована',
        'attempts-exhausted':
            'три попытки не дали презентации — дальше вручную',
        backoff: 'предыдущая попытка недавно — ждём перед повтором',
    };

const MINUTE_MS = 60_000;

/**
 * Решение по одной утверждённой заявке. Порядок проверок — от дешёвой к
 * дорогой: свежесть и метку попыток крон знает без Битрикса, признак
 * «обработано» стоит два чтения сделок, поэтому сервис сначала спрашивает
 * решение с `processed: false`, и только для «dispatch» идёт проверять.
 */
export function decideTmcApprovalRescue(
    candidate: TmcApprovalRescueCandidate,
    thresholds: TmcApprovalRescueThresholds,
): TmcApprovalRescueDecision {
    const skip = (
        reason: TmcApprovalRescueReason,
    ): TmcApprovalRescueDecision => ({
        action: 'skip',
        reason,
    });
    if (!candidate.movedAt) return skip('no-moved-time');

    const graceEdge =
        thresholds.now.getTime() - thresholds.graceMinutes * MINUTE_MS;
    if (candidate.movedAt.getTime() > graceEdge) return skip('too-fresh');
    if (candidate.processed) return skip('processed');

    const marker = candidate.marker;
    if (marker && marker.attempts > 0) {
        if (marker.attempts >= thresholds.maxAttempts) {
            return skip('attempts-exhausted');
        }
        const ladder = thresholds.backoffMinutes;
        const wait = ladder[Math.min(marker.attempts, ladder.length) - 1] ?? 0;
        const lastAt = Date.parse(marker.lastAt);
        if (
            Number.isFinite(lastAt) &&
            thresholds.now.getTime() - lastAt < wait * MINUTE_MS
        ) {
            return skip('backoff');
        }
    }
    return { action: 'dispatch', reason: 'dispatch' };
}
