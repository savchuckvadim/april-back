import { AnalyticsCallLiteRow, AnalyticsLiteDataset } from '@lib/call-lib';
import { CallsLoader } from '../domain/loaders/calls.loader';
import {
    AgendaUseCase,
    agendaWindows,
} from '../domain/use-cases/agenda.use-case';
import { PushAgendaUseCase } from '../domain/use-cases/push-agenda.use-case';
import { AiAnalyticsPushLogStore } from '../store/ai-analytics-push-log.store';
import {
    liteRow,
    portalSettings,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';

/**
 * Окна повестки планёрки: крон шлёт повестку в пн 08:30, поэтому звонки
 * берутся из прошлой полной ISO-недели (пн–вс перед понедельником
 * текущей), иначе понедельничная рассылка всегда была пустой. Несогласия —
 * с понедельника прошлой недели по «сейчас». Ключ — текущая неделя.
 */
const TZ = 'Europe/Moscow';
/** Понедельник 07.09.2026 08:30 MSK — слот рассылки повестки. */
const MONDAY_0830 = new Date('2026-09-07T05:30:00Z');

describe('agendaWindows', () => {
    it('пн 08:30: звонки пн 31.08 — вс 06.09, несогласия с пн 31.08 по сейчас, ключ текущей недели', () => {
        const windows = agendaWindows(MONDAY_0830, TZ);

        expect(windows.weekKey).toBe('2026-W37');
        expect(windows.calls).toEqual({
            from: new Date('2026-08-30T21:00:00.000Z'),
            to: new Date('2026-09-06T20:59:59.999Z'),
        });
        expect(windows.disagreements).toEqual({
            from: new Date('2026-08-30T21:00:00.000Z'),
            to: MONDAY_0830,
        });
    });

    it('вс 23:00 MSK — ещё текущая неделя: звонки прошлой недели пн 24.08 — вс 30.08', () => {
        const windows = agendaWindows(new Date('2026-09-06T20:00:00Z'), TZ);

        expect(windows.weekKey).toBe('2026-W36');
        expect(windows.calls).toEqual({
            from: new Date('2026-08-23T21:00:00.000Z'),
            to: new Date('2026-08-30T20:59:59.999Z'),
        });
    });

    it('граница года: пн 04.01.2027 → неделя 2027-W01, звонки 28.12.2026 — 03.01.2027', () => {
        const windows = agendaWindows(new Date('2027-01-04T05:30:00Z'), TZ);

        expect(windows.weekKey).toBe('2027-W01');
        expect(windows.calls).toEqual({
            from: new Date('2026-12-27T21:00:00.000Z'),
            to: new Date('2027-01-03T20:59:59.999Z'),
        });
    });
});

/** call-lib, который честно режет звонки по UTC-окну запроса. */
function callsInWindow(rows: AnalyticsCallLiteRow[]) {
    const loadLite = jest.fn((query: { from: string; to: string }) => {
        const from = new Date(query.from).getTime();
        const to = new Date(query.to).getTime();
        const inWindow = rows.filter(row => {
            const at = row.callStartedAt?.getTime() ?? Number.NaN;
            return at >= from && at <= to;
        });
        const dataset: AnalyticsLiteDataset = {
            rows: inWindow,
            totalCalls: inWindow.length,
            skippedNoManager: 0,
        };
        return Promise.resolve(dataset);
    });
    return { loader: new CallsLoader({ loadLite } as never), loadLite };
}

function makeMondayPush(rows: AnalyticsCallLiteRow[]) {
    const calls = callsInWindow(rows);
    const agenda = new AgendaUseCase(
        calls.loader,
        settingsLoaderWith(),
        { listInPeriod: jest.fn().mockResolvedValue([]) } as never,
        { resolveLinks: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    const systemAdd = jest.fn().mockResolvedValue({ result: true });
    const bitrix = {
        imNotify: { systemAdd },
        user: {
            get: jest
                .fn()
                .mockResolvedValue({ result: [{ LAST_NAME: 'И', NAME: 'И' }] }),
        },
    };
    const pushLog = new AiAnalyticsPushLogStore({
        listInPeriod: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue('9001'),
    } as never);
    const markSent = jest.spyOn(pushLog, 'markSent');
    const useCase = new PushAgendaUseCase(
        { init: jest.fn().mockResolvedValue({ bitrix }) } as never,
        agenda,
        pushLog,
    );
    const run = () =>
        useCase.run({
            domain: 'd',
            date: '2026-09-07',
            now: MONDAY_0830,
            settings: portalSettings({ ropUserIds: [447] }),
            recipients: null,
        });
    return { run, systemAdd, markSent, loadLite: calls.loadLite };
}

describe('PushAgendaUseCase + AgendaUseCase: понедельничная рассылка', () => {
    it('в прошлую неделю были разборы → повестка не пустая, уходит РОПам', async () => {
        const push = makeMondayPush([
            liteRow({
                transcriptionId: 'r1',
                managerId: '10',
                riskFlags: ['promise'],
                callStartedAt: new Date('2026-09-02T08:00:00Z'),
            }),
            // Звонок утра понедельника в повестку этой недели не попадает.
            liteRow({
                transcriptionId: 'today',
                managerId: '20',
                riskFlags: ['promise'],
                callStartedAt: new Date('2026-09-07T05:00:00Z'),
            }),
        ]);

        const result = await push.run();

        expect(result.status).toBe('sent');
        expect(result.delivered).toEqual([447]);
        expect(push.systemAdd).toHaveBeenCalledTimes(1);
        expect(push.markSent).toHaveBeenCalledWith(
            expect.objectContaining({
                object: 'agenda:2026-W37',
                payload: expect.objectContaining({
                    transcriptionIds: ['r1'],
                }) as unknown,
            }),
        );
    });

    it('в прошлую неделю разборов не было → skipped empty', async () => {
        const push = makeMondayPush([
            liteRow({
                transcriptionId: 'old',
                callStartedAt: new Date('2026-08-20T08:00:00Z'),
            }),
        ]);

        const result = await push.run();

        expect(result).toMatchObject({ status: 'skipped', reason: 'empty' });
        expect(push.systemAdd).not.toHaveBeenCalled();
    });
});
