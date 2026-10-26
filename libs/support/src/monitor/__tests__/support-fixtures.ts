import {
    SupportAuthorRole,
    SupportDialog,
    SupportMessage,
} from '../domain/support-dialog.types';

/** Начало отсчёта тестов: 26.10.2026 10:00 МСК. */
export const T0 = new Date('2026-10-26T07:00:00.000Z');

export const minutesAfter = (minutes: number, from: Date = T0): Date =>
    new Date(from.getTime() + minutes * 60_000);

export const message = (
    id: number,
    role: SupportAuthorRole,
    atMinute: number,
    text = `сообщение ${id}`,
): SupportMessage => ({
    id,
    at: minutesAfter(atMinute),
    role,
    authorName: role === 'client' ? 'Клиент' : 'Сотрудник',
    text,
});

export const dialog = (
    messages: SupportMessage[],
    overrides: Partial<SupportDialog> = {},
): SupportDialog => ({
    sessionId: 71,
    chatId: 769,
    lineId: 9,
    source: 'network',
    status: 'answered',
    createdAt: T0,
    operatorId: 135,
    operatorName: 'Муравьева Юлия',
    client: {
        userId: 123,
        name: 'Савчук Вадим',
        portal: 'alfacentr.bitrix24.ru',
    },
    crm: { entityType: 'deal', entityId: 16867 },
    messages,
    ...overrides,
});

export const THRESHOLDS = { remindMinutes: 10, escalateMinutes: 30 } as const;
