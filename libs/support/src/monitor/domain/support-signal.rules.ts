import {
    SupportDecision,
    SupportDialog,
    SupportDialogMemory,
    SupportMessage,
    SupportSignal,
    SupportSignalKind,
    SupportWaitLevel,
    SupportWaitThresholds,
} from './support-dialog.types';

const MINUTE_MS = 60_000;

/**
 * Первое сообщение клиента после последнего ответа сотрудника — с него
 * клиент ждёт. Клиент мог написать несколько раз подряд: ждёт он с первого,
 * поэтому повторное «алло?» отсчёт не сдвигает. Системные сообщения и боты
 * линии ответом не считаются.
 */
export function findPendingClientMessage(
    messages: readonly SupportMessage[],
): SupportMessage | null {
    let pending: SupportMessage | null = null;
    for (const message of messages) {
        if (message.role === 'staff') {
            pending = null;
        } else if (message.role === 'client' && !pending) {
            pending = message;
        }
    }
    return pending;
}

/** Целые минуты ожидания; часы портала могут убежать вперёд — не меньше 0. */
export function waitedMinutesOf(
    pending: SupportMessage | null,
    now: Date,
): number {
    if (!pending) return 0;
    return Math.max(
        0,
        Math.floor((now.getTime() - pending.at.getTime()) / MINUTE_MS),
    );
}

/** Уровни ожидания, до которых клиент уже дождался. */
export function reachedWaitLevels(
    waitedMinutes: number,
    thresholds: SupportWaitThresholds,
): SupportWaitLevel[] {
    const levels: SupportWaitLevel[] = [];
    if (waitedMinutes >= thresholds.remindMinutes) levels.push('remind');
    if (waitedMinutes >= thresholds.escalateMinutes) levels.push('escalate');
    return levels;
}

/** Последнее сообщение клиента в переписке; 0 — клиент ещё не писал. */
export function lastClientMessageIdOf(
    messages: readonly SupportMessage[],
): number {
    return messages.reduce(
        (last, message) =>
            message.role === 'client' && message.id > last ? message.id : last,
        0,
    );
}

/** Уровень ожидания, который пора разослать: срочный важнее напоминания. */
function dueWaitLevel(
    reached: readonly SupportWaitLevel[],
    sent: readonly SupportWaitLevel[],
): SupportWaitLevel | null {
    if (reached.includes('escalate') && !sent.includes('escalate')) {
        return 'escalate';
    }
    if (reached.includes('remind') && !sent.includes('remind')) return 'remind';
    return null;
}

/**
 * Что разослать по диалогу сейчас и что запомнить.
 *
 * - Новый диалог — оповещение сразу. Если клиент к этому моменту уже ждёт
 *   дольше порогов (первый просмотр после простоя), пройденные уровни
 *   считаются разосланными: одно сообщение вместо трёх подряд.
 * - Каждое новое сообщение клиента в уже известном диалоге — оповещение
 *   «клиент написал» (Telegram как зеркало реплик клиента), отвечали ему
 *   или нет.
 * - Клиент ждёт ответа — напоминание, потом срочный повтор; каждый уровень
 *   один раз на одно неотвеченное сообщение. Новые сообщения клиента,
 *   пришедшие к этому моменту, едут в том же оповещении.
 * - Ответ сотрудника гасит ожидание; следующее сообщение клиента
 *   запускает отсчёт и уровни заново.
 * - За один просмотр по диалогу — не больше одного оповещения: если
 *   пройдены оба порога, уходит срочное.
 */
export function decideSupportDialog(
    dialog: SupportDialog,
    memory: SupportDialogMemory | null,
    now: Date,
    thresholds: SupportWaitThresholds,
): SupportDecision {
    const pending = findPendingClientMessage(dialog.messages);
    const waitedMinutes = waitedMinutesOf(pending, now);
    const reached = reachedWaitLevels(waitedMinutes, thresholds);
    const waitingFor = pending?.id ?? null;
    const lastClientId = lastClientMessageIdOf(dialog.messages);
    const signalOf = (
        kind: SupportSignalKind,
        fresh: SupportMessage[],
    ): SupportSignal => ({ kind, dialog, pending, waitedMinutes, fresh });

    if (!memory?.announced) {
        return {
            signal: signalOf(
                'new_dialog',
                dialog.messages.filter(message => message.role === 'client'),
            ),
            memory: {
                announced: true,
                waitingFor,
                levels: reached,
                lastClientMessageId: lastClientId,
            },
        };
    }

    // Память до появления поля — точка отсчёта без рассылки.
    const seen = memory.lastClientMessageId ?? lastClientId;
    const fresh = dialog.messages.filter(
        message => message.role === 'client' && message.id > seen,
    );
    const sent =
        memory.waitingFor === waitingFor && waitingFor !== null
            ? memory.levels
            : [];
    const due = pending ? dueWaitLevel(reached, sent) : null;
    const levels: SupportWaitLevel[] =
        due === 'escalate'
            ? ['remind', 'escalate']
            : due === 'remind'
              ? [...sent, 'remind']
              : sent;
    const nextMemory: SupportDialogMemory = {
        announced: true,
        waitingFor,
        levels,
        lastClientMessageId: fresh.length ? lastClientId : seen,
    };

    if (due) {
        return {
            signal: signalOf(
                due === 'escalate' ? 'escalation' : 'waiting',
                fresh,
            ),
            memory: nextMemory,
        };
    }
    return {
        signal: fresh.length ? signalOf('client_message', fresh) : null,
        memory: nextMemory,
    };
}

/** Память не изменилась — перезаписывать её в хранилище незачем. */
export function isSameMemory(
    left: SupportDialogMemory | null,
    right: SupportDialogMemory,
): boolean {
    if (!left) return false;
    return (
        left.announced === right.announced &&
        left.waitingFor === right.waitingFor &&
        left.lastClientMessageId === right.lastClientMessageId &&
        left.levels.length === right.levels.length &&
        left.levels.every(level => right.levels.includes(level))
    );
}
