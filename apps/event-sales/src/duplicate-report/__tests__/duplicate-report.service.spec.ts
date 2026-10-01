import { ETimeZone } from '@lib/shared/lib/date';
import { fallbackWorkingHours } from '../../shared/working-hours/working-hours.model';
import { classifyClient } from '../lib/duplicate-classify';
import { STRUCTURE_MISSING_WARNING } from '../lib/duplicate-recipients';
import {
    DuplicateReportService,
    NO_RECIPIENTS_WARNING,
} from '../services/duplicate-report.service';
import type { DuplicateWorkbookInput } from '../excel/duplicate-excel.builder';
import type { DuplicateSnapshot } from '../services/duplicate-report.collector';
import type {
    DuplicateDeliveryItem,
    DuplicateDeliveryOptions,
    DuplicateDeliveryOutcome,
} from '../services/duplicate-report-delivery';
import {
    ClassifiedClient,
    DuplicateReportOptions,
} from '../types/duplicate-report.types';
import {
    CLASSIFY_OPTIONS,
    DOMAIN,
    makeClientInput,
    makeDeal,
    NOW,
} from './fixtures/duplicate-report.fixture';

const mockCollect = jest.fn<Promise<DuplicateSnapshot>, [unknown, string[]]>();
const mockDeliver = jest.fn<
    Promise<DuplicateDeliveryOutcome>,
    [DuplicateDeliveryItem, DuplicateDeliveryOptions, string[]]
>();
const mockBuildWorkbook = jest.fn<Promise<Buffer>, [DuplicateWorkbookInput]>();
const mockCloseStale = jest.fn<
    Promise<number>,
    [readonly number[], string[]]
>();

jest.mock('../services/duplicate-report.collector', () => ({
    DuplicateReportCollector: jest
        .fn()
        .mockImplementation(() => ({ collect: mockCollect })),
}));
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

const users = (...ids: number[]) => ids.map(ID => ({ ID }));

/** Снимок отделов: ОП 63 (РОП 309) с сотрудниками 11 и 12. */
const SNAPSHOT = {
    department: {
        generalDepartment: [
            { ID: 63, HEADS: [309], USERS: users(309, 11, 12) },
        ],
        childrenDepartments: [],
        parentDepartments: [],
    },
};

const CLIENT: ClassifiedClient = classifyClient(
    makeClientInput([makeDeal(1), makeDeal(2, { assignedById: 12 })]),
    CLASSIFY_OPTIONS,
);

const OPTIONS: DuplicateReportOptions = {
    countOnly: false,
    schedule: { weekday: 1, hour: 9 },
    recipients: { toHead: true, departmentUserIds: [], structureUserIds: [1] },
    excludeUserIds: [500],
    deadlineDays: 3,
};

const setup = () => {
    const bitrix = { tag: 'bitrix' };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix,
            PortalModel: { getTimezone: () => ETimeZone.EUROPE_MOSCOW },
        }),
    };
    const departments = {
        getFullDepartment: jest.fn().mockResolvedValue(SNAPSHOT),
    };
    const staff = {
        activeUserIds: jest.fn().mockResolvedValue(new Set([1, 309])),
    };
    const userNames = {
        resolve: jest
            .fn()
            .mockResolvedValue({ 11: 'Иван Петров', 12: 'Анна Сидорова' }),
    };
    const workingHours = {
        resolve: jest.fn().mockResolvedValue({
            hours: fallbackWorkingHours(),
            timezone: ETimeZone.EUROPE_MOSCOW,
        }),
    };
    const service = new DuplicateReportService(
        pbx as never,
        departments as never,
        staff as never,
        userNames as never,
        workingHours as never,
        { tag: 'store' } as never,
    );
    return { service, pbx, departments, staff, bitrix };
};

const run = (service: DuplicateReportService, options = OPTIONS) =>
    service.runForDomain(DOMAIN, options, new Date(NOW));

describe('DuplicateReportService — отчёт по дублям портала', () => {
    beforeEach(() => {
        mockCollect.mockReset().mockResolvedValue({
            scanned: 40,
            clients: [CLIENT],
            ownerId: 447,
        });
        mockDeliver
            .mockReset()
            .mockResolvedValue({ taskId: 9001, closedPrevious: true });
        mockBuildWorkbook.mockReset().mockResolvedValue(Buffer.from('xlsx'));
        mockCloseStale.mockReset().mockResolvedValue(0);
    });

    it('сбор — с периодом недели и исключёнными сотрудниками из настроек', async () => {
        const { service } = setup();

        await run(service);

        expect(mockCollect).toHaveBeenCalledWith(
            {
                now: new Date(NOW),
                periodStart: new Date('2026-09-27T21:00:00Z'),
                periodEnd: new Date('2026-10-04T21:00:00Z'),
                excludeUserIds: [500],
            },
            expect.any(Array),
        );
    });

    it('с задачами: Excel и задача каждому работающему получателю, итог считает задачи', async () => {
        const { service } = setup();

        const result = await run(service);

        expect(result).toMatchObject({
            countOnly: false,
            scanned: 40,
            clients: 1,
            deals: 2,
            recipients: 2,
            tasksCreated: 2,
            tasksClosed: 2,
        });
        expect(mockBuildWorkbook).toHaveBeenCalledTimes(2);
        expect(mockBuildWorkbook.mock.calls[0][0]).toMatchObject({
            domain: DOMAIN,
            period: { label: '28.09–04.10' },
            clients: [CLIENT],
            userNames: new Map([
                [11, 'Иван Петров'],
                [12, 'Анна Сидорова'],
            ]),
        });
        const [item, options] = mockDeliver.mock.calls[0];
        expect(item.userId).toBe(1);
        expect(item.title).toBe('Дубли сделок: отчёт за неделю 28.09–04.10');
        expect(item.fileName).toBe('Дубли сделок 28.09-04.10.xlsx');
        expect(item.describe(true)).toContain('[TABLE]');
        expect(options.ownerId).toBe(447);
        // Понедельник 9:00, три рабочих дня — среда 18:00 по Москве.
        expect(options.deadline).toEqual(new Date('2026-10-07T15:00:00Z'));
        expect(mockDeliver.mock.calls[1][0]).toMatchObject({ userId: 309 });
    });

    it('«только считать»: получатели посчитаны, файлы и задачи не создаются', async () => {
        const { service } = setup();

        const result = await run(service, { ...OPTIONS, countOnly: true });

        expect(result).toMatchObject({
            countOnly: true,
            recipients: 2,
            tasksCreated: 0,
        });
        expect(mockBuildWorkbook).not.toHaveBeenCalled();
        expect(mockDeliver).not.toHaveBeenCalled();
    });

    it('уволенному получателю задача не ставится — предупреждение', async () => {
        const { service, staff } = setup();
        staff.activeUserIds.mockResolvedValue(new Set([309]));

        const result = await run(service);

        expect(result.recipients).toBe(1);
        expect(mockDeliver).toHaveBeenCalledTimes(1);
        expect(result.warnings).toEqual([
            'получатели не работают — задачи им не ставятся: 1',
        ]);
    });

    it('получатели не заданы — предупреждение, структура не читается', async () => {
        const { service, departments } = setup();

        const result = await run(service, {
            ...OPTIONS,
            recipients: {
                toHead: false,
                departmentUserIds: [],
                structureUserIds: [],
            },
        });

        expect(result.recipients).toBe(0);
        expect(result.warnings).toEqual([NO_RECIPIENTS_WARNING]);
        expect(departments.getFullDepartment).not.toHaveBeenCalled();
    });

    it('структура не прочитана — РОПу не уходит, общий отчёт уходит', async () => {
        const { service, departments } = setup();
        departments.getFullDepartment.mockRejectedValue(new Error('timeout'));

        const result = await run(service);

        expect(result.recipients).toBe(1);
        expect(result.warnings).toEqual(
            expect.arrayContaining([STRUCTURE_MISSING_WARNING]),
        );
    });

    it('дублей нет — ни структуры, ни задач; прошлые задачи-отчёты закрываются', async () => {
        const { service, departments } = setup();
        mockCollect.mockResolvedValue({
            scanned: 40,
            clients: [],
            ownerId: 447,
        });
        mockCloseStale.mockResolvedValue(3);

        const result = await run(service);

        expect(result).toMatchObject({
            clients: 0,
            recipients: 0,
            tasksClosed: 3,
        });
        expect(departments.getFullDepartment).not.toHaveBeenCalled();
        expect(mockDeliver).not.toHaveBeenCalled();
        expect(mockCloseStale).toHaveBeenCalledWith([], expect.any(Array));
    });

    it('проба одному сотруднику: весь отчёт ему, даже при «только считать»; структура не читается', async () => {
        const { service, departments } = setup();

        const result = await service.runForDomain(
            DOMAIN,
            { ...OPTIONS, countOnly: true },
            new Date(NOW),
            { previewUserId: 7 },
        );

        expect(result).toMatchObject({
            countOnly: false,
            recipients: 1,
            tasksCreated: 1,
        });
        expect(mockDeliver).toHaveBeenCalledTimes(1);
        expect(mockDeliver.mock.calls[0][0].userId).toBe(7);
        expect(departments.getFullDepartment).not.toHaveBeenCalled();
        // Проба не закрывает чужие прошлые задачи.
        expect(mockCloseStale).not.toHaveBeenCalled();
    });

    it('сбой сборки файла одному получателю не мешает остальным', async () => {
        const { service } = setup();
        mockBuildWorkbook.mockRejectedValueOnce(new Error('exceljs упал'));

        const result = await run(service);

        expect(result.tasksCreated).toBe(1);
        expect(mockDeliver).toHaveBeenCalledTimes(1);
        expect(result.warnings).toEqual([
            'отчёт сотруднику 1 не собран: exceljs упал',
        ]);
    });
});
