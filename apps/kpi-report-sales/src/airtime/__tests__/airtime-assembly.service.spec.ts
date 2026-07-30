import { AirtimeAssemblyService } from '../services/airtime-assembly.service';
import type { AirtimeMonthCell } from '../types/airtime-statistic.type';

// «Сейчас»: 30 июля 2026 — текущий месяц июль, сегодня 2026-07-30.
const NOW = new Date(2026, 6, 30, 12, 0, 0);
const DOMAIN = 'example.bitrix24.ru';

const cell = (seconds: number, calls = 1): AirtimeMonthCell => ({
    callsCount: calls,
    airtimeSeconds: seconds,
    incoming: { count: 0, seconds: 0 },
    outgoing: { count: calls, seconds },
});

const marker = (rowsFetched: number, truncated = false) => ({
    truncated,
    rowsFetched,
    completedAt: '2026-07-01T00:00:00.000Z',
});

const departament = [
    { ID: '1', NAME: 'Иван', LAST_NAME: 'Иванов' },
    { ID: '2', NAME: 'Пётр', LAST_NAME: 'Петров' },
];

interface MockOptions {
    monthMarkers?: Record<string, ReturnType<typeof marker> | null>;
    errorMarkers?: Record<string, { message: string; failedAt: string } | null>;
    dayMarkers?: Record<
        string,
        { truncated: boolean; rowsFetched: number } | null
    >;
    todayBlob?: {
        date: string;
        cells: Record<string, AirtimeMonthCell>;
        rowsFetched: number;
        truncated: boolean;
        computedAt: string;
    } | null;
    monthCells?: Record<string, Map<number, AirtimeMonthCell | null>>;
    dayCells?: Map<string, AirtimeMonthCell | null>;
    durationStats?: { avgMs: number; samples: number } | null;
}

const createService = (options: MockOptions) => {
    const cellCache = {
        getMonthCells: jest.fn((_d: string, month: string, userIds: number[]) =>
            Promise.resolve(
                options.monthCells?.[month] ??
                    new Map(userIds.map(id => [id, null])),
            ),
        ),
        getDayCells: jest.fn(
            (_d: string, dates: string[], userIds: number[]) => {
                const map = new Map<string, AirtimeMonthCell | null>();
                for (const date of dates) {
                    for (const id of userIds) {
                        const pair = `${id}|${date}`;
                        map.set(pair, options.dayCells?.get(pair) ?? null);
                    }
                }
                return Promise.resolve(map);
            },
        ),
    };
    const markerCache = {
        getMonthMarkers: jest.fn((_d: string, months: string[]) =>
            Promise.resolve(
                new Map(
                    months.map(m => [m, options.monthMarkers?.[m] ?? null]),
                ),
            ),
        ),
        getErrorMarkers: jest.fn((_d: string, months: string[]) =>
            Promise.resolve(
                new Map(
                    months.map(m => [m, options.errorMarkers?.[m] ?? null]),
                ),
            ),
        ),
        getDayMarkers: jest.fn((_d: string, dates: string[]) =>
            Promise.resolve(
                new Map(
                    dates.map(date => [
                        date,
                        options.dayMarkers?.[date] ?? null,
                    ]),
                ),
            ),
        ),
        getTodayBlob: jest.fn(() => Promise.resolve(options.todayBlob ?? null)),
        getDurationStats: jest.fn(() =>
            Promise.resolve(options.durationStats ?? null),
        ),
    };
    return {
        service: new AirtimeAssemblyService(
            cellCache as never,
            markerCache as never,
        ),
        cellCache,
        markerCache,
    };
};

/** Дневные маркеры на все даты диапазона (включительно). */
const dayMarkersFor = (
    from: number,
    to: number,
    month = '2026-07',
): Record<string, { truncated: boolean; rowsFetched: number }> => {
    const markers: Record<string, { truncated: boolean; rowsFetched: number }> =
        {};
    for (let day = from; day <= to; day++) {
        markers[`${month}-${String(day).padStart(2, '0')}`] = {
            truncated: false,
            rowsFetched: 1,
        };
    }
    return markers;
};

describe('AirtimeAssemblyService.checkReadiness', () => {
    it('все месяцы с маркерами → allReady, rowsFetched и статусы по месяцам', async () => {
        const { service } = createService({
            monthMarkers: {
                '2026-05': marker(100),
                '2026-06': marker(50),
            },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            false,
            NOW,
        );

        expect(readiness.allReady).toBe(true);
        expect(readiness.hasError).toBe(false);
        expect(readiness.readyMonths).toBe(2);
        expect(readiness.totalMonths).toBe(2);
        expect(readiness.months).toEqual([
            { month: '2026-05', status: 'ready' },
            { month: '2026-06', status: 'ready' },
        ]);
    });

    it('месяц без маркера → queued в прогрессе, allReady false', async () => {
        const { service } = createService({
            monthMarkers: { '2026-05': marker(100), '2026-06': null },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            false,
            NOW,
        );

        expect(readiness.allReady).toBe(false);
        expect(readiness.readyMonths).toBe(1);
        expect(readiness.months).toEqual([
            { month: '2026-05', status: 'ready' },
            { month: '2026-06', status: 'queued' },
        ]);
    });

    it('несобранные юниты → etaSeconds по дефолту (замеров нет)', async () => {
        const { service } = createService({
            monthMarkers: { '2026-05': marker(100), '2026-06': null },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            false,
            NOW,
        );

        expect(readiness.etaSeconds).toBe(120); // 1 месяц × дефолт 120с
    });

    it('etaSeconds считается по скользящему среднему домена, всё готово → нет ETA', async () => {
        const { service } = createService({
            monthMarkers: { '2026-05': null, '2026-06': null },
            durationStats: { avgMs: 60_000, samples: 5 },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            false,
            NOW,
        );
        expect(readiness.etaSeconds).toBe(120); // 2 месяца × 60с замера

        const { service: readyService } = createService({
            monthMarkers: { '2026-05': marker(1), '2026-06': marker(1) },
        });
        const ready = await readyService.checkReadiness(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            false,
            NOW,
        );
        expect(ready.etaSeconds).toBeUndefined();
    });

    it('живой error-маркер месяца → статус error и его сообщение', async () => {
        const { service } = createService({
            errorMarkers: {
                '2026-06': { message: 'Битрикс упал', failedAt: 'x' },
            },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-06-01',
            '2026-06-30',
            false,
            NOW,
        );

        expect(readiness.hasError).toBe(true);
        expect(readiness.errorMessage).toBe('Битрикс упал');
        expect(readiness.months).toEqual([
            { month: '2026-06', status: 'error' },
        ]);
    });

    it('forceRefresh гасит error-статус (ретрай) и инвалидирует готовый хвост', async () => {
        const { service } = createService({
            errorMarkers: {
                '2026-06': { message: 'Битрикс упал', failedAt: 'x' },
            },
            dayMarkers: dayMarkersFor(1, 29),
            todayBlob: {
                date: '2026-07-30',
                cells: {},
                rowsFetched: 0,
                truncated: false,
                computedAt: 'x',
            },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-06-01',
            '2026-07-31',
            true,
            NOW,
        );

        expect(readiness.hasError).toBe(false);
        expect(readiness.months).toEqual([
            { month: '2026-06', status: 'queued' },
            { month: '2026-07', status: 'queued' },
        ]);
    });

    it('текущий месяц: все дневные маркеры + today-блоб → ready', async () => {
        const { service } = createService({
            dayMarkers: dayMarkersFor(1, 29),
            todayBlob: {
                date: '2026-07-30',
                cells: { '1': cell(5) },
                rowsFetched: 2,
                truncated: false,
                computedAt: 'x',
            },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-07-01',
            '2026-07-31',
            false,
            NOW,
        );

        expect(readiness.allReady).toBe(true);
        // 29 дневных маркеров по 1 строке + 2 строки блоба
        expect(readiness.units[0].rowsFetched).toBe(31);
    });

    it('текущий месяц без today-блоба → queued', async () => {
        const { service } = createService({
            dayMarkers: dayMarkersFor(1, 29),
            todayBlob: null,
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-07-01',
            '2026-07-31',
            false,
            NOW,
        );

        expect(readiness.allReady).toBe(false);
        expect(readiness.months).toEqual([
            { month: '2026-07', status: 'queued' },
        ]);
    });

    it('пропуск одного дневного маркера → месяц queued', async () => {
        const markers = dayMarkersFor(1, 29);
        delete markers['2026-07-15'];
        const { service } = createService({
            dayMarkers: markers,
            todayBlob: {
                date: '2026-07-30',
                cells: {},
                rowsFetched: 0,
                truncated: false,
                computedAt: 'x',
            },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-07-01',
            '2026-07-31',
            false,
            NOW,
        );

        expect(readiness.allReady).toBe(false);
    });
});

describe('AirtimeAssemblyService.assemble', () => {
    it('суммирует ячейки запрошенных сотрудников; нет ячейки при живом маркере = ноль', async () => {
        const { service } = createService({
            monthMarkers: {
                '2026-05': marker(100),
                '2026-06': marker(50, true),
            },
            monthCells: {
                '2026-05': new Map([
                    [1, cell(100, 2)],
                    [2, null], // тихий сотрудник — достоверный ноль
                ]),
                '2026-06': new Map([
                    [1, null],
                    [2, cell(40)],
                ]),
            },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-05-01',
            '2026-06-30',
            false,
            NOW,
        );
        const report = await service.assemble(
            DOMAIN,
            readiness,
            departament,
            NOW,
        );

        expect(report.users).toHaveLength(2);
        const [ivan, petr] = report.users;
        expect(ivan.airtimeSeconds).toBe(100);
        expect(ivan.callsCount).toBe(2);
        expect(petr.airtimeSeconds).toBe(40);
        expect(report.rowsFetched).toBe(150);
        expect(report.truncated).toBe(true); // OR по маркерам
    });

    it('span-юнит: дневные ячейки + today-блоб входят в сумму', async () => {
        const dayCells = new Map<string, AirtimeMonthCell | null>([
            ['1|2026-07-10', cell(10)],
        ]);
        const { service } = createService({
            dayMarkers: dayMarkersFor(1, 29),
            dayCells,
            todayBlob: {
                date: '2026-07-30',
                cells: { '1': cell(5) },
                rowsFetched: 1,
                truncated: false,
                computedAt: 'x',
            },
        });

        const readiness = await service.checkReadiness(
            DOMAIN,
            '2026-07-01',
            '2026-07-31',
            false,
            NOW,
        );
        const report = await service.assemble(
            DOMAIN,
            readiness,
            departament,
            NOW,
        );

        const [ivan, petr] = report.users;
        expect(ivan.airtimeSeconds).toBe(15); // 10 (день) + 5 (сегодня)
        expect(petr.airtimeSeconds).toBe(0);
    });
});
