import {
    decideSupportDialog,
    findPendingClientMessage,
    isSameMemory,
    reachedWaitLevels,
    waitedMinutesOf,
} from '../domain/support-signal.rules';
import { SupportDialogMemory } from '../domain/support-dialog.types';
import { dialog, message, minutesAfter, THRESHOLDS } from './support-fixtures';

const announced = (
    waitingFor: number | null = null,
    levels: SupportDialogMemory['levels'] = [],
): SupportDialogMemory => ({ announced: true, waitingFor, levels });

describe('findPendingClientMessage', () => {
    it('ждёт с ПЕРВОГО неотвеченного сообщения клиента, повторы отсчёт не сдвигают', () => {
        const messages = [
            message(1, 'client', 0),
            message(2, 'staff', 2),
            message(3, 'client', 5),
            message(4, 'client', 9, 'алло?'),
        ];
        expect(findPendingClientMessage(messages)?.id).toBe(3);
    });

    it('ответ сотрудника гасит ожидание', () => {
        const messages = [message(1, 'client', 0), message(2, 'staff', 3)];
        expect(findPendingClientMessage(messages)).toBeNull();
    });

    it('системные сообщения и боты ответом не считаются', () => {
        const messages = [
            message(1, 'client', 0),
            message(2, 'other', 0, 'Добро пожаловать в Открытую линию'),
            message(3, 'other', 400, 'переадресовал диалог'),
        ];
        expect(findPendingClientMessage(messages)?.id).toBe(1);
    });

    it('без сообщений клиента — никто не ждёт', () => {
        expect(findPendingClientMessage([message(1, 'other', 0)])).toBeNull();
    });
});

describe('waitedMinutesOf и reachedWaitLevels', () => {
    it('целые минуты, будущее время портала даёт 0', () => {
        const pending = message(1, 'client', 0);
        expect(waitedMinutesOf(pending, minutesAfter(12.9))).toBe(12);
        expect(waitedMinutesOf(pending, minutesAfter(-3))).toBe(0);
        expect(waitedMinutesOf(null, minutesAfter(50))).toBe(0);
    });

    it('уровни ожидания по порогам', () => {
        expect(reachedWaitLevels(9, THRESHOLDS)).toEqual([]);
        expect(reachedWaitLevels(10, THRESHOLDS)).toEqual(['remind']);
        expect(reachedWaitLevels(30, THRESHOLDS)).toEqual([
            'remind',
            'escalate',
        ]);
    });
});

describe('decideSupportDialog', () => {
    const waiting = dialog([message(10, 'client', 0)]);

    it('новый диалог — оповещение сразу', () => {
        const decision = decideSupportDialog(
            waiting,
            null,
            minutesAfter(1),
            THRESHOLDS,
        );
        expect(decision.signal?.kind).toBe('new_dialog');
        expect(decision.signal?.pending?.id).toBe(10);
        expect(decision.memory).toEqual(announced(10, []));
    });

    it('новый диалог, увиденный поздно: одно оповещение, пройденные уровни поглощены', () => {
        const decision = decideSupportDialog(
            waiting,
            null,
            minutesAfter(45),
            THRESHOLDS,
        );
        expect(decision.signal?.kind).toBe('new_dialog');
        expect(decision.signal?.waitedMinutes).toBe(45);
        expect(decision.memory.levels).toEqual(['remind', 'escalate']);

        const next = decideSupportDialog(
            waiting,
            decision.memory,
            minutesAfter(48),
            THRESHOLDS,
        );
        expect(next.signal).toBeNull();
    });

    it('клиент ждёт 10 минут — напоминание, один раз', () => {
        const first = decideSupportDialog(
            waiting,
            announced(10),
            minutesAfter(10),
            THRESHOLDS,
        );
        expect(first.signal?.kind).toBe('waiting');
        expect(first.memory.levels).toEqual(['remind']);

        const again = decideSupportDialog(
            waiting,
            first.memory,
            minutesAfter(13),
            THRESHOLDS,
        );
        expect(again.signal).toBeNull();
        expect(again.memory).toEqual(first.memory);
    });

    it('клиент ждёт 30 минут — срочный повтор, один раз', () => {
        const escalation = decideSupportDialog(
            waiting,
            announced(10, ['remind']),
            minutesAfter(31),
            THRESHOLDS,
        );
        expect(escalation.signal?.kind).toBe('escalation');
        expect(escalation.memory.levels).toEqual(['remind', 'escalate']);

        const again = decideSupportDialog(
            waiting,
            escalation.memory,
            minutesAfter(60),
            THRESHOLDS,
        );
        expect(again.signal).toBeNull();
    });

    it('оба порога пройдены за один просмотр — уходит только срочное', () => {
        const decision = decideSupportDialog(
            waiting,
            announced(10),
            minutesAfter(35),
            THRESHOLDS,
        );
        expect(decision.signal?.kind).toBe('escalation');
        expect(decision.memory.levels).toEqual(['remind', 'escalate']);
    });

    it('ответ сотрудника гасит ожидание и память уровней', () => {
        const answered = dialog([
            message(10, 'client', 0),
            message(11, 'staff', 12),
        ]);
        const decision = decideSupportDialog(
            answered,
            announced(10, ['remind']),
            minutesAfter(40),
            THRESHOLDS,
        );
        expect(decision.signal).toBeNull();
        expect(decision.memory).toEqual(announced(null, []));
    });

    it('клиент написал снова после ответа — отсчёт и уровни заново', () => {
        const reopened = dialog([
            message(10, 'client', 0),
            message(11, 'staff', 12),
            message(12, 'client', 20),
        ]);
        const early = decideSupportDialog(
            reopened,
            announced(10, ['remind', 'escalate']),
            minutesAfter(25),
            THRESHOLDS,
        );
        expect(early.signal).toBeNull();
        expect(early.memory).toEqual(announced(12, []));

        const reminded = decideSupportDialog(
            reopened,
            early.memory,
            minutesAfter(30),
            THRESHOLDS,
        );
        expect(reminded.signal?.kind).toBe('waiting');
        expect(reminded.signal?.pending?.id).toBe(12);
        expect(reminded.signal?.waitedMinutes).toBe(10);
    });

    it('новый диалог без сообщений клиента всё равно объявляется', () => {
        const decision = decideSupportDialog(
            dialog([]),
            null,
            minutesAfter(1),
            THRESHOLDS,
        );
        expect(decision.signal?.kind).toBe('new_dialog');
        expect(decision.signal?.pending).toBeNull();
        expect(decision.memory).toEqual(announced(null, []));
    });
});

describe('isSameMemory', () => {
    it('сравнивает память без учёта порядка уровней', () => {
        expect(
            isSameMemory(
                announced(1, ['escalate', 'remind']),
                announced(1, ['remind', 'escalate']),
            ),
        ).toBe(true);
        expect(isSameMemory(null, announced())).toBe(false);
        expect(isSameMemory(announced(1), announced(2))).toBe(false);
    });
});
