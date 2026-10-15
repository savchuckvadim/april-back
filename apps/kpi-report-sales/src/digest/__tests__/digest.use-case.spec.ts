import { DigestUseCase } from '../use-cases/digest.use-case';
import { listElement, portalModelMock } from './digest-list-fields.fixture';
import * as voximplant from '../../airtime/lib/voximplant-fetch.util';

/**
 * Юнит use-case'а: кэш-хит не ходит в Битрикс, промах — выгружает
 * партиции, пишет их write-through и конверт результата; звонки
 * fail-open; forceRefresh обходит чтение.
 */

const DAY = '2026-10-14';

const NO_FUNNEL_WARNINGS = [
    'Воронка «ОП Презентации» не настроена на портале — презентации дня недоступны.',
    'Воронка «ОП Основная» не настроена — продажи дня недоступны.',
];

const listPage = (rows: Record<string, unknown>[]) => ({
    result: rows,
    total: rows.length,
});

const createMocks = (options: {
    dayRows?: Record<string, unknown>[];
    plannedRows?: Record<string, unknown>[];
    cache?: Record<string, unknown>;
} = {}) => {
    const api = {
        // Порядок вызовов: события дня, затем план на день.
        call: jest
            .fn()
            .mockResolvedValueOnce(listPage(options.dayRows ?? []))
            .mockResolvedValueOnce(listPage(options.plannedRows ?? [])),
        addCmdBatch: jest.fn(),
        callBatchWithConcurrency: jest.fn(() => Promise.resolve([])),
    };
    const pbx = {
        init: jest.fn(() =>
            Promise.resolve({
                portal: { id: 1 },
                bitrix: { api },
                PortalModel: portalModelMock(),
            }),
        ),
    };
    const store = new Map<string, unknown>(Object.entries(options.cache ?? {}));
    const partitions = {
        get: jest.fn((_domain: string, key: string) =>
            Promise.resolve(store.get(key) ?? null),
        ),
        set: jest.fn(
            (_domain: string, key: string, data: unknown) => {
                store.set(key, data);
                return Promise.resolve();
            },
        ),
    };
    const results = { setReady: jest.fn(() => Promise.resolve()) };
    return { api, pbx, partitions, results, store };
};

const filters = (ids: string[]) => ({
    kind: 'day' as const,
    date: DAY,
    departament: ids.map(id => ({ ID: id, NAME: 'Иван', LAST_NAME: `П${id}` })),
});

const voxRows = (rows: unknown[], truncated = false) =>
    jest
        .spyOn(voximplant, 'fetchAirtimeRows')
        .mockResolvedValue({ rows: rows as never, truncated });

afterEach(() => jest.restoreAllMocks());

describe('DigestUseCase', () => {
    it('промах кэша: выгружает события и план, звонки, пишет партиции и конверт', async () => {
        const fetchRows = voxRows([
            { CALL_ID: '1', PORTAL_USER_ID: '42', CALL_DURATION: '90', CALL_TYPE: '1', CALL_START_DATE: '2026-10-14T10:00:00+03:00' },
        ]);
        const mocks = createMocks({
            dayRows: [
                listElement({ id: 1, userId: 42, type: 21, action: 13, eventDate: '14.10.2026 10:00:00' }),
                listElement({ id: 2, userId: 42, type: 23, action: 11, eventDate: '14.10.2026 11:00:00', planDate: '16.10.2026 12:00:00' }),
                listElement({ id: 3, userId: 7, type: 21, action: 14, eventDate: '14.10.2026 12:00:00', reason: 41 }),
            ],
            plannedRows: [
                listElement({ id: 4, userId: 42, type: 23, action: 11, eventDate: '12.10.2026 10:00:00', planDate: '14.10.2026 15:00:00' }),
            ],
        });
        const useCase = new DigestUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never, mocks.partitions as never, mocks.results as never);

        const report = await useCase.generate(filters(['42']), {
            now: new Date(2026, 9, 15, 10, 0, 0),
        });

        // Фильтры к Битриксу: события дня по event_date, план — по plan_date
        // и событию до начала дня, значения item'ов — bitrixId.
        expect(mocks.api.call.mock.calls[0][1]).toEqual(
            expect.objectContaining({
                IBLOCK_ID: '55',
                filter: { '>PROPERTY_103': '14.10.2026', '<PROPERTY_103': '15.10.2026' },
            }),
        );
        expect(mocks.api.call.mock.calls[1][1]).toEqual(
            expect.objectContaining({
                filter: {
                    PROPERTY_100: ['11', '12'],
                    '>=PROPERTY_104': '14.10.2026',
                    '<PROPERTY_104': '15.10.2026',
                    '<PROPERTY_103': '14.10.2026',
                },
            }),
        );
        expect(fetchRows).toHaveBeenCalledWith(
            mocks.api,
            expect.objectContaining({
                '>CALL_START_DATE': '2026-10-14',
                '<CALL_START_DATE': '2026-10-15',
            }),
            expect.any(Number),
            expect.anything(),
        );

        expect(report.employees).toHaveLength(1);
        const [employee] = report.employees;
        expect(employee.userId).toBe(42);
        expect(employee.name).toBe('Иван П42');
        expect(employee.done).toEqual({ total: 1, byType: { xo: 1 } });
        expect(employee.planned).toEqual({ total: 1, byType: { presentation: 1 } });
        expect(employee.plannedBeyond.total).toBe(1);
        expect(employee.plannedAtStart).toEqual({ total: 1, byType: { presentation: 1 } });
        expect(employee.plannedAtStartRecords).toHaveLength(1);
        expect(employee.records).toHaveLength(2);
        expect(employee.calls?.callsCount).toBe(1);
        expect(employee.calls?.byHour[10].seconds).toBe(90);

        // Сводка — по всем ответственным портала, включая не запрошенного 7.
        expect(report.summary.usersCount).toBe(2);
        expect(report.summary.totals.notHeld.total).toBe(1);
        expect(report.summary.totals.noresultReasons).toEqual({ nopickup: 1 });
        expect(report.summary.calls?.callsCount).toBe(1);
        // Воронки сделок в фикстуре не настроены — презентации пустые с предупреждением.
        expect(report.warnings).toEqual(NO_FUNNEL_WARNINGS);
        expect(report.presentations).toEqual({ items: [], sales: [], truncated: false });
        expect(report.truncated).toBe(false);
        expect(report.catalog.types.length).toBeGreaterThan(0);

        // Партиции записаны: закрытый день — длинный TTL.
        expect(mocks.partitions.set).toHaveBeenCalledTimes(4);
        const [, dayKey, , dayTtl, dayGroup] = mocks.partitions.set.mock.calls[0] as unknown[];
        expect(dayKey).toBe('v1:day:2026-10-14');
        expect(dayTtl).toBe(30 * 24 * 60 * 60);
        expect(dayGroup).toBe('day');
        expect(mocks.results.setReady).toHaveBeenCalledWith(
            'kpi-digest',
            'example.bitrix24.ru',
            'v1:result:2026-10-14:42',
            report,
            180,
        );
    });

    it('кэш-хит всех партиций — Битрикс не вызывается', async () => {
        const fetchRows = voxRows([]);
        const cachedDay = {
            date: DAY,
            byUser: { '42': { counters: { ...emptyCountersLike(), sales: 2 }, records: [] } },
            usersCount: 1,
            elements: 2,
            truncated: false,
            builtAt: 'x',
        };
        const mocks = createMocks({
            cache: {
                'v1:day:2026-10-14': cachedDay,
                'v1:planned:2026-10-14': { date: DAY, byUser: {}, elements: 0, truncated: false, builtAt: 'x' },
                'v1:calls:2026-10-14': { date: DAY, byUser: {}, rowsFetched: 0, truncated: false, builtAt: 'x' },
                'v1:pres:2026-10-14': { date: DAY, items: [], sales: [], truncated: false, warnings: [], builtAt: 'x' },
            },
        });
        const useCase = new DigestUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never, mocks.partitions as never);

        const report = await useCase.generate(filters(['42']));

        expect(mocks.api.call).not.toHaveBeenCalled();
        expect(fetchRows).not.toHaveBeenCalled();
        expect(mocks.partitions.set).not.toHaveBeenCalled();
        expect(report.employees[0].sales).toBe(2);
        expect(report.employees[0].calls?.callsCount).toBe(0);
    });

    it('forceRefresh обходит чтение кэша, но пишет свежие партиции', async () => {
        voxRows([]);
        const mocks = createMocks({
            cache: {
                'v1:day:2026-10-14': { date: DAY, byUser: {}, usersCount: 0, elements: 0, truncated: false, builtAt: 'x' },
            },
        });
        const useCase = new DigestUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never, mocks.partitions as never);

        await useCase.generate(filters(['42']), { forceRefresh: true });

        expect(mocks.partitions.get).not.toHaveBeenCalled();
        expect(mocks.api.call).toHaveBeenCalledTimes(2);
        expect(mocks.partitions.set).toHaveBeenCalledTimes(4);
    });

    it('недоступная телефония — warning и calls: null, события дня отдаются', async () => {
        jest.spyOn(voximplant, 'fetchAirtimeRows').mockRejectedValue(new Error('vox down'));
        const mocks = createMocks({
            dayRows: [
                listElement({ id: 1, userId: 42, type: 21, action: 13, eventDate: '14.10.2026 10:00:00' }),
            ],
        });
        const useCase = new DigestUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never, mocks.partitions as never);

        const report = await useCase.generate(filters(['42']));

        expect(report.employees[0].calls).toBeNull();
        expect(report.summary.calls).toBeNull();
        expect(report.employees[0].done.total).toBe(1);
        expect(report.warnings[0]).toContain('vox down');
        // Партиция звонков не записана; события, план и презентации — записаны.
        expect(mocks.partitions.set).toHaveBeenCalledTimes(3);
    });

    it('обрезанная партиция — truncated в ответе и короткий TTL', async () => {
        voxRows([], true);
        const mocks = createMocks();
        const useCase = new DigestUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never, mocks.partitions as never);

        const report = await useCase.generate(filters(['42']), {
            now: new Date(2026, 9, 20),
        });

        expect(report.truncated).toBe(true);
        const callsSet = mocks.partitions.set.mock.calls.find(
            call => (call as unknown[])[1] === 'v1:calls:2026-10-14',
        ) as unknown[];
        expect(callsSet[3]).toBe(120);
    });

    it('сотрудники без активности получают нулевые строки, дубли и мусор в departament отсеиваются', async () => {
        voxRows([]);
        const mocks = createMocks();
        const useCase = new DigestUseCase();
        await useCase.init('example.bitrix24.ru', mocks.pbx as never, mocks.partitions as never);

        const report = await useCase.generate(filters(['42', '42', 'x', '']));

        expect(report.employees.map(e => e.userId)).toEqual([42]);
        expect(report.employees[0].done).toEqual({ total: 0, byType: {} });
        expect(report.employees[0].records).toEqual([]);
    });
});

function emptyCountersLike() {
    const count = () => ({ total: 0, byType: {} });
    return {
        plannedAtStart: count(),
        planned: count(),
        plannedBeyond: count(),
        done: count(),
        notHeld: count(),
        postponed: count(),
        expired: count(),
        documents: count(),
        sales: 0,
        refusals: 0,
        noresultReasons: {},
    };
}
