import { ETimeZone } from '@lib/shared/lib/date';
import { DUPLICATE_RECIPIENT_ROLE } from '../constants/duplicate-report.const';
import type { DuplicateWorkbookInput } from '../excel/duplicate-excel.builder';
import { classifyClient } from '../lib/duplicate-classify';
import type {
    DuplicateDeliveryItem,
    DuplicateDeliveryOptions,
    DuplicateDeliveryOutcome,
} from '../services/duplicate-report-delivery';
import { DuplicateReportDispatcher } from '../services/duplicate-report.dispatcher';
import {
    CLASSIFY_OPTIONS,
    DAY,
    DOMAIN,
    makeClientInput,
    makeDeal,
    NOW,
} from './fixtures/duplicate-report.fixture';

const mockDeliver = jest.fn<
    Promise<DuplicateDeliveryOutcome>,
    [DuplicateDeliveryItem, DuplicateDeliveryOptions, string[]]
>();
const mockBuildWorkbook = jest.fn<Promise<Buffer>, [DuplicateWorkbookInput]>();
const mockCloseStale = jest.fn<
    Promise<number>,
    [readonly number[], string[]]
>();

jest.mock('../services/duplicate-report-delivery', () => ({
    DuplicateReportDelivery: jest.fn().mockImplementation(() => ({
        deliver: mockDeliver,
        closeStale: mockCloseStale,
    })),
}));
jest.mock('../excel/duplicate-excel.builder', () => ({
    buildDuplicateWorkbook: (input: DuplicateWorkbookInput) =>
        mockBuildWorkbook(input),
}));

const CLIENT = classifyClient(
    makeClientInput([makeDeal(1), makeDeal(2, { assignedById: 12 })]),
    CLASSIFY_OPTIONS,
);

const INPUT = {
    domain: DOMAIN,
    reports: [
        {
            userId: 309,
            roles: [DUPLICATE_RECIPIENT_ROLE.head],
            clients: [CLIENT],
        },
    ],
    period: {
        from: new Date(NOW - 7 * DAY),
        to: new Date(NOW),
        label: '28.09–04.10',
    },
    timezone: ETimeZone.EUROPE_MOSCOW,
    now: new Date(NOW),
    ownerId: 447,
    deadlineDays: 2,
};

describe('DuplicateReportDispatcher — рассылка отчёта получателям', () => {
    beforeEach(() => {
        mockDeliver
            .mockReset()
            .mockResolvedValue({ taskId: 1, closedPrevious: false });
        mockBuildWorkbook.mockReset().mockResolvedValue(Buffer.from('xlsx'));
        mockCloseStale.mockReset().mockResolvedValue(0);
    });

    const STORE = {
        previous: jest.fn(),
        remember: jest.fn(),
        recipients: jest.fn(),
        forget: jest.fn(),
    };
    const dispatcherWith = (names: Record<number, string> = {}) =>
        new DuplicateReportDispatcher(
            { tag: 'bitrix' } as never,
            STORE,
            { resolve: jest.fn().mockResolvedValue(names) },
            { resolve: jest.fn().mockRejectedValue(new Error('no scope')) },
        );

    it('календарь портала недоступен — срок по графику пн–пт, отчёт всё равно уходит', async () => {
        const resolveNames = jest.fn().mockResolvedValue({ 11: 'Иван Петров' });
        const dispatcher = new DuplicateReportDispatcher(
            { tag: 'bitrix' } as never,
            STORE,
            { resolve: resolveNames },
            { resolve: jest.fn().mockRejectedValue(new Error('no scope')) },
        );

        const result = await dispatcher.dispatch(INPUT, []);

        expect(result).toEqual({ tasksCreated: 1, tasksClosed: 0 });
        // Имена ответственных и самого получателя (для имени файла).
        expect(resolveNames).toHaveBeenCalledWith(
            DOMAIN,
            { tag: 'bitrix' },
            [309, 11, 12],
        );
        // Понедельник 9:00, два рабочих дня — вторник 18:00 по Москве.
        expect(mockDeliver.mock.calls[0][1].deadline).toEqual(
            new Date('2026-10-06T15:00:00Z'),
        );
        expect(mockBuildWorkbook.mock.calls[0][0].userNames).toEqual(
            new Map([[11, 'Иван Петров']]),
        );
    });

    it('файл называется по получателю — в папке отчётов не будет «(1)», «(2)»', async () => {
        await dispatcherWith({ 309: 'Олег Глава' }).dispatch(INPUT, []);

        expect(mockDeliver.mock.calls[0][0].fileName).toBe(
            'Дубли сделок 28.09-04.10 — Олег Глава.xlsx',
        );
    });

    it('после рассылки закрывает прошлые задачи тех, кому отчёта нет', async () => {
        mockCloseStale.mockResolvedValue(2);

        const result = await dispatcherWith().dispatch(INPUT, []);

        expect(mockCloseStale).toHaveBeenCalledWith([309], []);
        expect(result.tasksClosed).toBe(2);
    });

    it('ни одной задачи не поставлено — прошлые не закрываются (сбой, а не «дублей нет»)', async () => {
        mockDeliver.mockResolvedValue({ taskId: null, closedPrevious: false });

        await dispatcherWith().dispatch(INPUT, []);

        expect(mockCloseStale).not.toHaveBeenCalled();
    });

    it('дублей нет вовсе — закрываются все прошлые; проба одному — ничего не закрывает', async () => {
        await dispatcherWith().dispatch({ ...INPUT, reports: [] }, []);
        expect(mockCloseStale).toHaveBeenCalledWith([], []);

        mockCloseStale.mockClear();
        await dispatcherWith().dispatch({ ...INPUT, preview: true }, []);
        expect(mockCloseStale).not.toHaveBeenCalled();
    });
});
