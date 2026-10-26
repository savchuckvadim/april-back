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

const signalOf = (
    kind: SupportSignalKind,
    dialog: SupportDialog,
    pending: SupportMessage | null,
    waitedMinutes: number,
): SupportSignal => ({ kind, dialog, pending, waitedMinutes });

/**
 * Что разослать по диалогу сейчас и что запомнить.
 *
 * - Новый диалог — оповещение сразу. Если клиент к этому моменту уже ждёт
 *   дольше порогов (первый просмотр после простоя), пройденные уровни
 *   считаются разосланными: одно сообщение вместо трёх подряд.
 * - Клиент ждёт ответа — напоминание, потом срочный повтор; каждый уровень
 *   один раз на одно неотвеченное сообщение.
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
    const sent =
        memory && memory.waitingFor === waitingFor && waitingFor !== null
            ? memory.levels
            : [];

    if (!memory?.announced) {
        return {
            signal: signalOf('new_dialog', dialog, pending, waitedMinutes),
            memory: { announced: true, waitingFor, levels: reached },
        };
    }

    if (!pending) {
        return {
            signal: null,
            memory: { announced: true, waitingFor: null, levels: [] },
        };
    }

    if (reached.includes('escalate') && !sent.includes('escalate')) {
        return {
            signal: signalOf('escalation', dialog, pending, waitedMinutes),
            memory: {
                announced: true,
                waitingFor,
                levels: ['remind', 'escalate'],
            },
        };
    }

    if (reached.includes('remind') && !sent.includes('remind')) {
        return {
            signal: signalOf('waiting', dialog, pending, waitedMinutes),
            memory: {
                announced: true,
                waitingFor,
                levels: [...sent, 'remind'],
            },
        };
    }

    return {
        signal: null,
        memory: { announced: true, waitingFor, levels: sent },
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
        left.levels.length === right.levels.length &&
        left.levels.every(level => right.levels.includes(level))
    );
}
