import { DUPLICATE_ORIGIN } from '../constants/duplicate-report.const';
import { DuplicateReportCollector } from '../services/duplicate-report.collector';
import {
    DuplicateContext,
    DuplicateDeal,
    DuplicateGroup,
} from '../types/duplicate-report.types';
import { DAY, makeDeal, NOW } from './fixtures/duplicate-report.fixture';

const mockLoadDeals = jest.fn<Promise<DuplicateDeal[]>, []>();
const mockLoadContext = jest.fn<
    Promise<DuplicateContext>,
    [DuplicateGroup[], string[]]
>();

jest.mock('../services/duplicate-deals.reader', () => ({
    DuplicateDealsReader: jest
        .fn()
        .mockImplementation(() => ({ load: mockLoadDeals })),
}));
jest.mock('../services/duplicate-context.reader', () => ({
    DuplicateContextReader: jest
        .fn()
        .mockImplementation(() => ({ load: mockLoadContext })),
}));

const CONTEXT: DuplicateContext = {
    clientTitles: new Map([['company:200', 'ООО «Бета»']]),
    clientInns: new Map(),
    leads: new Map(),
    openTasks: new Map([[3, [{ id: 30, responsibleId: 11 }]]]),
};

const INPUT = {
    now: new Date(NOW),
    periodStart: new Date(NOW - 7 * DAY),
    periodEnd: new Date(NOW),
    excludeUserIds: [500],
};

const setup = () => {
    const bitrix = {
        user: {
            getCurrent: jest.fn().mockResolvedValue({ result: { ID: '447' } }),
        },
    };
    const staff = {
        activeUserIds: jest.fn().mockResolvedValue(new Set([11, 12])),
    };
    const collector = new DuplicateReportCollector(
        bitrix as never,
        {} as never,
        'garant.bitrix24.ru',
        staff,
    );
    return { bitrix, staff, collector };
};

describe('DuplicateReportCollector — чтение портала и разбор клиентов', () => {
    beforeEach(() => {
        mockLoadDeals.mockReset();
        mockLoadContext.mockReset().mockResolvedValue(CONTEXT);
    });

    it('исключённые сотрудники выпадают до второго прохода; разбор с работающими и владельцем вебхука', async () => {
        mockLoadDeals.mockResolvedValue([
            makeDeal(1, { companyId: 100, assignedById: 11 }),
            makeDeal(2, { companyId: 100, assignedById: 500 }),
            makeDeal(3, { companyId: 200, assignedById: 11 }),
            makeDeal(4, {
                companyId: 200,
                assignedById: 12,
                createdById: 447,
                createdAt: NOW - DAY,
            }),
        ]);
        const { staff, collector } = setup();
        const warnings: string[] = [];

        const snapshot = await collector.collect(INPUT, warnings);

        expect(snapshot.scanned).toBe(4);
        expect(snapshot.ownerId).toBe(447);
        const groups = mockLoadContext.mock.calls[0][0];
        expect(groups.map(group => group.client.id)).toEqual([200]);
        expect(staff.activeUserIds).toHaveBeenCalledWith(
            'garant.bitrix24.ru',
            expect.anything(),
            [11, 12],
        );
        const [client] = snapshot.clients;
        expect(client.title).toBe('ООО «Бета»');
        // Сделку без лида создал владелец вебхука — автоматика.
        expect(client.origin).toBe(DUPLICATE_ORIGIN.automation);
        expect(client.newThisWeek).toBe(true);
        expect(
            client.deals.find(item => item.deal.id === 3)?.deal.openTasks,
        ).toBe(1);
        expect(warnings).toEqual([]);
    });

    it('нет клиентов с двумя сделками — второй проход и проверка сотрудников не делаются', async () => {
        mockLoadDeals.mockResolvedValue([
            makeDeal(1, { companyId: 100 }),
            makeDeal(2, { companyId: 200 }),
        ]);
        const { staff, collector } = setup();

        const snapshot = await collector.collect(INPUT, []);

        expect(snapshot).toEqual({ scanned: 2, clients: [], ownerId: 447 });
        expect(mockLoadContext).not.toHaveBeenCalled();
        expect(staff.activeUserIds).not.toHaveBeenCalled();
    });

    it('владелец вебхука не прочитан — предупреждение, разбор идёт без него', async () => {
        mockLoadDeals.mockResolvedValue([
            makeDeal(3, { companyId: 200 }),
            makeDeal(4, { companyId: 200 }),
        ]);
        const { bitrix, collector } = setup();
        bitrix.user.getCurrent.mockRejectedValue(new Error('expired_token'));
        const warnings: string[] = [];

        const snapshot = await collector.collect(INPUT, warnings);

        expect(snapshot.ownerId).toBeNull();
        expect(snapshot.clients).toHaveLength(1);
        expect(warnings).toEqual([
            'владелец вебхука не определён (user.current): expired_token',
        ]);
    });

    it('проверка «кто работает» упала — все ответственные считаются работающими', async () => {
        mockLoadDeals.mockResolvedValue([
            makeDeal(3, { companyId: 200, assignedById: 11 }),
            makeDeal(4, { companyId: 200, assignedById: 99 }),
        ]);
        const { staff, collector } = setup();
        staff.activeUserIds.mockRejectedValue(new Error('user.get timeout'));
        const warnings: string[] = [];

        const snapshot = await collector.collect(INPUT, warnings);

        expect(snapshot.clients[0].deals.every(item => item.working)).toBe(
            true,
        );
        expect(warnings).toEqual([
            expect.stringContaining(
                'не проверено, кто из ответственных работает',
            ),
        ]);
    });
});
