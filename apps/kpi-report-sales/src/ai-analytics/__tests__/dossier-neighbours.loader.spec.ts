import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import { DossierNeighboursLoader } from '../domain/loaders/dossier-neighbours.loader';
import type { AiDossierJobData } from '../dto/ai-dossier.dto';
import type { AiAnalyticsSnapshotRecord } from '../store/ai-analytics-snapshot.store';
import { portalSettings } from './fixtures/lite-row.fixture';

/**
 * Источники разделов соседних ручек для досье (Фаза 3): какие записи
 * `ais` читаются под тренды, месяц год назад и план-факт, и что
 * происходит, когда их нет либо настройки портала не читаются.
 */
const DOMAIN = 'a.bitrix24.ru';
const MANAGER = '512';

const job = (
    months: string[] = ['2026-07', '2026-08', '2026-09'],
): AiDossierJobData => ({
    domain: DOMAIN,
    managerId: MANAGER,
    months,
    requestKey: 'key',
});

function record(
    type: string,
    periodKey: string,
    managerId: string | null,
    payload: Record<string, unknown>,
): AiAnalyticsSnapshotRecord {
    return {
        id: `ais-${type}-${periodKey}`,
        domain: DOMAIN,
        type: type as AiAnalyticsSnapshotRecord['type'],
        periodKey,
        managerId,
        calcVersion: 'v1',
        paramsVersion: 'pv-1',
        inputsHash: 'h',
        generatedAt: '2026-09-21T01:00:00Z',
        createdAt: new Date('2026-09-21T01:00:00Z'),
        status: 'done',
        payload,
    };
}

interface Query {
    type: string;
    periodKeys: readonly string[];
    managerIds?: readonly (string | null)[];
}

function makeLoader(
    options: {
        byType?: Record<string, AiAnalyticsSnapshotRecord[]>;
        months?: AiAnalyticsSnapshotRecord[];
        settingsFail?: boolean;
    } = {},
) {
    const queries: Query[] = [];
    const monthQueries: string[][] = [];
    const snapshots = {
        findByKeys: jest.fn(
            (
                unusedDomain: string,
                type: string,
                filter: {
                    periodKeys?: readonly string[];
                    managerIds?: readonly (string | null)[];
                },
            ) => {
                queries.push({
                    type,
                    periodKeys: filter.periodKeys ?? [],
                    ...(filter.managerIds
                        ? { managerIds: filter.managerIds }
                        : {}),
                });
                return Promise.resolve(options.byType?.[type] ?? []);
            },
        ),
        findManagerMonths: jest.fn((unusedDomain: string, keys: string[]) => {
            monthQueries.push(keys);
            return Promise.resolve(options.months ?? []);
        }),
    };
    const settings = {
        load: jest.fn(() =>
            options.settingsFail
                ? Promise.reject(new Error('настройки недоступны'))
                : Promise.resolve(
                      portalSettings({
                          calendar: DEFAULT_WORK_CALENDAR,
                          dailyPlanEnabled: false,
                      }),
                  ),
        ),
    };
    const loader = new DossierNeighboursLoader(
        snapshots as never,
        settings as never,
    );

    return { loader, queries, monthQueries, settings };
}

describe('DossierNeighboursLoader — источники соседних разделов', () => {
    it('тренды по неделям окна и менеджеру: побеждает самая поздняя неделя', async () => {
        const { loader, queries } = makeLoader({
            byType: {
                'ai-analytics-trends': [
                    record('ai-analytics-trends', '2026-W38', MANAGER, {
                        weekKey: '2026-W38',
                    }),
                    record('ai-analytics-trends', '2026-W36', MANAGER, {
                        weekKey: '2026-W36',
                    }),
                ],
            },
        });

        const result = await loader.load(job());

        const trendsQuery = queries.find(
            query => query.type === 'ai-analytics-trends',
        );
        expect(trendsQuery?.managerIds).toEqual([MANAGER]);
        expect(trendsQuery?.periodKeys).toEqual(
            expect.arrayContaining(['2026-W27', '2026-W38']),
        );
        expect(result.trends?.periodKey).toBe('2026-W38');
        expect(result.snapshotIds).toEqual([
            'ais-ai-analytics-trends-2026-W38',
        ]);
    });

    it('месяц год назад читается по ключу M−12 последнего месяца окна', async () => {
        const { loader, monthQueries } = makeLoader({
            months: [
                record('ai-analytics-manager-month', '2025-09', MANAGER, {
                    n: 30,
                }),
            ],
        });

        const result = await loader.load(job());

        expect(monthQueries).toEqual([['2025-09']]);
        expect(result.baseMonth?.periodKey).toBe('2025-09');
    });

    it('план-факт: снимок целей месяца и настройки портала', async () => {
        const { loader, queries } = makeLoader({
            byType: {
                'ai-analytics-plan': [
                    record('ai-analytics-plan', '2026-09', null, {
                        monthKey: '2026-09',
                        managers: [],
                    }),
                ],
            },
        });

        const result = await loader.load(job());

        expect(
            queries.find(query => query.type === 'ai-analytics-plan')
                ?.periodKeys,
        ).toEqual(['2026-09']);
        expect(result.planFact).toMatchObject({
            monthKey: '2026-09',
            plan: { monthKey: '2026-09' },
            timeZone: DEFAULT_WORK_CALENDAR.timeZone,
            dailyPlanEnabled: false,
        });
    });

    it('настройки не прочитаны — план-факт null, остальные источники на месте', async () => {
        const { loader } = makeLoader({ settingsFail: true });

        const result = await loader.load(job());

        expect(result.planFact).toBeNull();
        expect(result.trends).toBeNull();
        expect(result.baseMonth).toBeNull();
    });

    it('пустое окно — ничего не читается', async () => {
        const { loader, queries, settings } = makeLoader();

        const result = await loader.load(job([]));

        expect(queries).toEqual([]);
        expect(settings.load).not.toHaveBeenCalled();
        expect(result).toEqual({
            trends: null,
            baseMonth: null,
            planFact: null,
            snapshotIds: [],
        });
    });
});
