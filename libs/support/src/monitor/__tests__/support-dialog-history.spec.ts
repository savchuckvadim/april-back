import {
    normalizeClientPortal,
    planDialogHistory,
    SupportDialogHistoryRow,
    SupportDialogSeen,
} from '../domain/support-dialog-history';
import { summarizeDialogHistory } from '../domain/support-dialog-stats';

const LINE = 'april-dev.bitrix24.ru';
const T0 = new Date('2026-11-08T09:00:00Z');
const T1 = new Date('2026-11-08T09:03:00Z');

const seen = (
    overrides: Partial<SupportDialogSeen> = {},
): SupportDialogSeen => ({
    sessionId: 71,
    chatId: 769,
    lineId: 9,
    clientName: 'Савчук Вадим',
    clientPortal: 'April-Garant.bitrix24.ru',
    operatorName: null,
    waitedMinutes: 4,
    pendingText: 'Здравствуйте',
    ...overrides,
});

const row = (
    overrides: Partial<SupportDialogHistoryRow> = {},
): SupportDialogHistoryRow => ({
    id: 'row-71',
    lineDomain: LINE,
    sessionId: 71,
    chatId: 769,
    lineId: 9,
    clientPortal: 'april-garant.bitrix24.ru',
    clientName: 'Савчук Вадим',
    operatorName: null,
    maxWaitedMinutes: 4,
    firstSeenAt: T0,
    lastSeenAt: T0,
    answeredAt: null,
    closedAt: null,
    ...overrides,
});

describe('normalizeClientPortal', () => {
    it.each([
        ['https://April-Garant.bitrix24.ru/', 'april-garant.bitrix24.ru'],
        ['april-garant.bitrix24.ru/crm?x=1', 'april-garant.bitrix24.ru'],
        ['  ', null],
        [null, null],
    ])('%s → %s', (input, expected) => {
        expect(normalizeClientPortal(input)).toBe(expected);
    });
});

describe('planDialogHistory', () => {
    it('новый диалог — строка с первым появлением и портал в нижнем регистре', () => {
        const plan = planDialogHistory([], [seen()], T0, true);
        expect(plan.updates).toEqual([]);
        expect(plan.closeIds).toEqual([]);
        expect(plan.creates).toEqual([
            {
                sessionId: 71,
                firstSeenAt: T0,
                chatId: 769,
                lineId: 9,
                clientPortal: 'april-garant.bitrix24.ru',
                clientName: 'Савчук Вадим',
                operatorName: null,
                maxWaitedMinutes: 4,
                lastSeenAt: T0,
                answeredAt: null,
            },
        ]);
    });

    it('известный диалог: ожидание — максимум, ответ — с первого такта без ожидания', () => {
        const plan = planDialogHistory(
            [row({ maxWaitedMinutes: 9 })],
            [
                seen({
                    waitedMinutes: 0,
                    pendingText: null,
                    operatorName: 'Иван',
                }),
            ],
            T1,
            true,
        );
        expect(plan.creates).toEqual([]);
        expect(plan.updates).toEqual([
            expect.objectContaining({
                id: 'row-71',
                maxWaitedMinutes: 9,
                operatorName: 'Иван',
                answeredAt: T1,
                lastSeenAt: T1,
            }),
        ]);
    });

    it('первый ответ не перезаписывается, оператор и портал не теряются', () => {
        const plan = planDialogHistory(
            [row({ answeredAt: T0, operatorName: 'Иван' })],
            [
                seen({
                    clientPortal: null,
                    operatorName: null,
                    waitedMinutes: 2,
                }),
            ],
            T1,
            true,
        );
        expect(plan.updates[0]).toEqual(
            expect.objectContaining({
                answeredAt: T0,
                operatorName: 'Иван',
                clientPortal: 'april-garant.bitrix24.ru',
            }),
        );
    });

    it('пропал из открытых — закрыть; уже закрытые не трогаем', () => {
        const plan = planDialogHistory(
            [
                row({ id: 'gone', sessionId: 70 }),
                row({ id: 'old', sessionId: 60, closedAt: T0 }),
            ],
            [],
            T1,
            true,
        );
        expect(plan.closeIds).toEqual(['gone']);
    });

    it('список прочитан не целиком — никого не закрываем', () => {
        const plan = planDialogHistory(
            [row({ id: 'gone', sessionId: 70 })],
            [seen()],
            T1,
            false,
        );
        expect(plan.closeIds).toEqual([]);
        expect(plan.creates).toHaveLength(1);
    });
});

describe('summarizeDialogHistory', () => {
    it('считает открытые, без ответа, ожидание и последние — новые первыми', () => {
        const stats = summarizeDialogHistory(
            [
                row({
                    id: 'a',
                    sessionId: 1,
                    maxWaitedMinutes: 0,
                    answeredAt: T0,
                    closedAt: T1,
                }),
                row({
                    id: 'b',
                    sessionId: 2,
                    maxWaitedMinutes: 10,
                    firstSeenAt: T1,
                }),
                row({
                    id: 'c',
                    sessionId: 3,
                    maxWaitedMinutes: 20,
                    closedAt: T1,
                }),
            ],
            2,
        );
        expect(stats).toEqual(
            expect.objectContaining({
                total: 3,
                open: 1,
                closedUnanswered: 1,
                avgWaitMinutes: 15,
                longestWaitMinutes: 20,
                lastAt: T1,
            }),
        );
        expect(stats.recent.map(item => item.sessionId)).toEqual([2, 1]);
        expect(stats.recent[1]).toEqual(
            expect.objectContaining({
                answered: true,
                url: `https://${LINE}/online/?IM_DIALOG=chat769`,
            }),
        );
    });

    it('пусто — нули и null, без деления на ноль', () => {
        expect(summarizeDialogHistory([], 10)).toEqual({
            total: 0,
            open: 0,
            closedUnanswered: 0,
            avgWaitMinutes: null,
            longestWaitMinutes: 0,
            lastAt: null,
            recent: [],
        });
    });
});
