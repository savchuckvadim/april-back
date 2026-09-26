import {
    OverviewSnapshotsLoader,
    YOY_MONTHS_LIMIT,
} from '../domain/loaders/overview-snapshots.loader';
import { OverviewUseCase } from '../domain/use-cases/overview.use-case';
import type {
    AiAnalyticsSnapshotRecord,
    AiAnalyticsSnapshotStore,
} from '../store/ai-analytics-snapshot.store';
import {
    callsLoaderWith,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import {
    emptyFinance,
    emptyKpi,
    emptyPlans,
    OVERVIEW_DOMAIN,
    OVERVIEW_FROM,
    OVERVIEW_NOW,
    OVERVIEW_TO,
    twoManagersRows,
} from './fixtures/overview.fixture';

/**
 * Паспорта менеджеров для строки обзора: читаются из месячных снапшотов
 * `ai-analytics-manager-month` (месяц конца периода и прошлый) тем же
 * читателем шины, что у конвейера, и доезжают до строки через use-case.
 */
const DOMAIN = 'a.bitrix24.ru';

function monthRecord(
    periodKey: string,
    managerId: string,
    passport: Record<string, unknown> | null,
): AiAnalyticsSnapshotRecord {
    return {
        id: `ais-${periodKey}-${managerId}`,
        domain: DOMAIN,
        type: 'ai-analytics-manager-month' as AiAnalyticsSnapshotRecord['type'],
        periodKey,
        managerId,
        calcVersion: 'v1',
        paramsVersion: 'pv-1',
        inputsHash: 'h',
        generatedAt: '2026-09-05T01:00:00Z',
        createdAt: new Date('2026-09-05T01:00:00Z'),
        status: 'done',
        payload: passport === null ? { level: 'middle' } : { passport },
    };
}

const passportOf = (
    level: string,
    since: string,
    tenureMonths: number,
): Record<string, unknown> => ({
    since,
    sinceSource: 'register',
    status: 'active',
    leftAt: null,
    level,
    levelSource: 'default',
    tenureMonths,
    tenureBand: tenureMonths < 6 ? '0-6' : '6-18',
});

/** Стор: месяцы менеджеров по ключам, прочих снапшотов нет. */
function storeWith(
    records: readonly AiAnalyticsSnapshotRecord[],
    options: { failMonths?: boolean } = {},
): { store: AiAnalyticsSnapshotStore; findManagerMonths: jest.Mock } {
    const findManagerMonths = jest.fn(
        (unusedDomain: string, monthKeys: readonly string[]) =>
            options.failMonths
                ? Promise.reject(new Error('ais недоступна'))
                : Promise.resolve(
                      records.filter(record =>
                          monthKeys.includes(record.periodKey),
                      ),
                  ),
    );
    const store = {
        findManagerMonths,
        findByKeys: jest.fn().mockResolvedValue([]),
        latest: jest.fn().mockResolvedValue(null),
    } as unknown as AiAnalyticsSnapshotStore;

    return { store, findManagerMonths };
}

describe('OverviewSnapshotsLoader.loadPassports', () => {
    it('читает месяц конца периода и прошлый одной выборкой', async () => {
        const { store, findManagerMonths } = storeWith([]);

        await new OverviewSnapshotsLoader(store).loadPassports(
            DOMAIN,
            '2026-09-01',
        );

        expect(findManagerMonths).toHaveBeenCalledWith(
            DOMAIN,
            ['2026-08', '2026-09'],
            { limit: YOY_MONTHS_LIMIT * 2 },
        );
    });

    it('при двух месяцах побеждает месяц конца периода', async () => {
        const { store } = storeWith([
            monthRecord(
                '2026-09',
                '512',
                passportOf('middle', '2026-01-10', 7),
            ),
            monthRecord(
                '2026-08',
                '512',
                passportOf('junior', '2026-01-10', 6),
            ),
            monthRecord(
                '2026-08',
                '447',
                passportOf('junior', '2026-06-01', 2),
            ),
        ]);

        const passports = await new OverviewSnapshotsLoader(
            store,
        ).loadPassports(DOMAIN, '2026-09-20');

        expect(passports.get('512')).toMatchObject({
            managerId: '512',
            level: 'middle',
            tenureMonths: 7,
            since: '2026-01-10',
            sinceSource: 'register',
        });
        // Снимка текущего месяца у 447 нет — берётся прошлый месяц.
        expect(passports.get('447')?.level).toBe('junior');
    });

    it('месяц без паспорта (шаг не отработал) — менеджера нет в выдаче', async () => {
        const { store } = storeWith([monthRecord('2026-09', '512', null)]);

        const passports = await new OverviewSnapshotsLoader(
            store,
        ).loadPassports(DOMAIN, '2026-09-20');

        expect(passports.size).toBe(0);
    });

    it('id менеджера — из записи, даже если в паспорте его нет', async () => {
        const { store } = storeWith([
            monthRecord(
                '2026-09',
                '512',
                passportOf('senior', '2024-01-01', 32),
            ),
        ]);

        const passports = await new OverviewSnapshotsLoader(
            store,
        ).loadPassports(DOMAIN, '2026-09-20');

        expect([...passports.keys()]).toEqual(['512']);
    });
});

describe('OverviewUseCase: паспорт месяца в строке', () => {
    function useCaseWith(store: AiAnalyticsSnapshotStore): OverviewUseCase {
        const roster = [10, 20];
        return new OverviewUseCase(
            settingsLoaderWith(),
            { resolve: jest.fn().mockResolvedValue(roster) } as never,
            callsLoaderWith(twoManagersRows()).loader,
            {
                loadKpiMonths: jest.fn().mockResolvedValue(emptyKpi(roster)),
            } as never,
            {
                loadFinance: jest.fn().mockResolvedValue(emptyFinance(roster)),
            } as never,
            {
                loadPlans: jest.fn().mockResolvedValue(emptyPlans(roster)),
            } as never,
            { load: jest.fn().mockResolvedValue(new Map()) } as never,
            {
                loadLevels: jest
                    .fn()
                    .mockResolvedValue(
                        new Map([
                            [
                                10,
                                { managerId: 10, level: 'senior', since: null },
                            ],
                        ]),
                    ),
            } as never,
            { listInPeriod: jest.fn().mockResolvedValue([]) } as never,
            store,
        );
    }
    const input = {
        domain: OVERVIEW_DOMAIN,
        from: OVERVIEW_FROM,
        to: OVERVIEW_TO,
    };

    it('без ручной записи строка берёт уровень паспорта, ручная — главнее', async () => {
        const { store } = storeWith([
            monthRecord('2026-09', '10', passportOf('junior', '2026-05-01', 4)),
            monthRecord('2026-09', '20', passportOf('junior', '2026-05-01', 4)),
        ]);

        const dto = await useCaseWith(store).execute(input, {
            now: OVERVIEW_NOW,
        });
        const rows = new Map(dto.managers.map(row => [row.managerId, row]));

        expect(rows.get('20')).toMatchObject({
            level: 'junior',
            levelSource: 'passport',
            tenureMonths: 4,
            since: '2026-05-01',
            sinceSource: 'register',
        });
        expect(rows.get('10')).toMatchObject({
            level: 'senior',
            levelSource: 'manual',
            since: '2026-05-01',
        });
    });

    it('ais не ответила на месяцы — обзор не гаснет, уровень по дефолту', async () => {
        const { store } = storeWith([], { failMonths: true });

        const dto = await useCaseWith(store).execute(input, {
            now: OVERVIEW_NOW,
        });

        expect(dto.managers.find(row => row.managerId === '20')).toMatchObject({
            level: 'middle',
            levelSource: 'default',
            tenureMonths: null,
        });
    });
});
