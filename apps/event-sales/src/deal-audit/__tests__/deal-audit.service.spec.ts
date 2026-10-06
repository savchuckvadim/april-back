import { Logger } from '@nestjs/common';
import { ETimeZone } from '@lib/shared/lib/date';
import { DEAL_AUDIT_STATUS } from '../constants/deal-audit.const';
import {
    DealAuditOptions,
    DealAuditService,
} from '../services/deal-audit.service';

/**
 * Прогон аудита целиком: отделы → самые давние сделки → задачи только по
 * ним → признаки. Сеть подменена, правила и ридеры настоящие.
 */

type Row = Record<string, unknown>;

const DOMAIN = 'portal.bitrix24.ru';

const portal = {
    getDealCategoryByCode: () => ({
        bitrixId: '31',
        stages: [{ code: 'sales_warm', name: 'Переговоры', bitrixId: 'WARM' }],
    }),
    // Поля аудита не установлены: прогон считает, но не пишет.
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: () => '',
    getTimezone: () => ETimeZone.EUROPE_MOSCOW,
};

const DEPARTMENTS = {
    department: {
        generalDepartment: [
            { ID: 31, NAME: 'ОП 1', USERS: [{ ID: 11 }, { ID: 12 }] },
        ],
        childrenDepartments: [{ ID: 33, NAME: 'ОП 2', USERS: [{ ID: 21 }] }],
    },
};

const daysAgo = (days: number): string =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const options = (extra: Partial<DealAuditOptions> = {}): DealAuditOptions => ({
    idleDays: 14,
    overdueHours: 24,
    stageStuckDays: 30,
    forgotCloseDays: 21,
    dryRun: true,
    maxPerRun: 500,
    maxPerDepartment: 50,
    digest: {
        toManager: false,
        toHead: false,
        userIds: [],
        departmentUserIds: [],
        excludeUserIds: [],
        limit: 20,
    },
    ...extra,
});

/** Битрикс-заглушка: журнал команд по пачкам и ответы по ключам. */
const makeBitrix = (results: Record<string, unknown>, listRows: Row[] = []) => {
    let queue: string[] = [];
    const batches: string[][] = [];
    const push = (key: string) => {
        queue.push(key);
    };
    const bitrix = {
        deal: { getList: jest.fn().mockResolvedValue({ result: listRows }) },
        batch: {
            deal: { getList: push },
            task: { getList: push },
        },
        api: {
            callBatchWithConcurrency: jest.fn().mockImplementation(() => {
                const result: Record<string, unknown> = {};
                for (const key of queue) {
                    if (key in results) result[key] = results[key];
                }
                batches.push(queue);
                queue = [];
                return Promise.resolve([{ result }]);
            }),
        },
    };
    return { bitrix, batches };
};

const makeService = (
    results: Record<string, unknown>,
    listRows: Row[] = [],
) => {
    const { bitrix, batches } = makeBitrix(results, listRows);
    const getFullDepartment = jest.fn().mockResolvedValue(DEPARTMENTS);
    const send = jest.fn().mockResolvedValue(0);
    const service = new DealAuditService(
        {
            init: jest.fn().mockResolvedValue({ bitrix, PortalModel: portal }),
        } as never,
        { send } as never,
        { getFullDepartment } as never,
    );
    return { service, bitrix, batches, getFullDepartment, send };
};

describe('DealAuditService.runForDomain', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('берёт сделки по отделам одной пачкой и задачи — только по этим сделкам', async () => {
        const { service, batches } = makeService({
            audit_group_0: [
                {
                    ID: '10',
                    TITLE: 'Сделка с работой',
                    STAGE_ID: 'C31:WARM',
                    ASSIGNED_BY_ID: '11',
                    COMPANY_ID: '5',
                    LAST_ACTIVITY_TIME: daysAgo(1),
                    MOVED_TIME: daysAgo(3),
                },
            ],
            audit_group_1: [
                {
                    ID: '20',
                    TITLE: 'Забытая сделка',
                    STAGE_ID: 'C31:WARM',
                    ASSIGNED_BY_ID: '21',
                    LAST_ACTIVITY_TIME: daysAgo(40),
                    MOVED_TIME: daysAgo(40),
                },
            ],
            audit_group_outside: [],
            audit_tasks_10: {
                tasks: [
                    {
                        id: '700',
                        status: '2',
                        deadline: new Date(
                            Date.now() + 24 * 60 * 60 * 1000,
                        ).toISOString(),
                    },
                ],
            },
            audit_tasks_20: { tasks: [] },
        });

        const result = await service.runForDomain(DOMAIN, options());

        expect(batches).toEqual([
            ['audit_group_0', 'audit_group_1', 'audit_group_outside'],
            ['audit_tasks_10', 'audit_tasks_20'],
        ]);
        expect(result.scanned).toBe(2);
        // Забыта только сделка без задач и без работы сорок дней.
        expect(result.verdicts.map(verdict => verdict.dealId)).toEqual([20]);
        expect(result.verdicts[0].status).toBe(DEAL_AUDIT_STATUS.noTask);
        expect(result.verdicts[0].idleDays).toBeGreaterThanOrEqual(39);
    });

    it('«только считать»: ничего не пишет и сводок не шлёт', async () => {
        const { service, send } = makeService({
            audit_group_0: [{ ID: '10', ASSIGNED_BY_ID: '11' }],
            audit_group_1: [],
            audit_group_outside: [],
            audit_tasks_10: { tasks: [] },
        });

        const result = await service.runForDomain(DOMAIN, options());

        expect(result.dryRun).toBe(true);
        expect(result.written).toBe(0);
        expect(send).not.toHaveBeenCalled();
    });

    it('ручной прогон по сделкам — структура отделов не читается', async () => {
        const { service, getFullDepartment, bitrix, batches } = makeService(
            { audit_tasks_31077: { tasks: [] } },
            [{ ID: '31077', ASSIGNED_BY_ID: '369' }],
        );

        const result = await service.runForDomain(
            DOMAIN,
            options({ dealIds: [31077] }),
        );

        expect(getFullDepartment).not.toHaveBeenCalled();
        expect(bitrix.deal.getList).toHaveBeenCalledTimes(1);
        expect(batches).toEqual([['audit_tasks_31077']]);
        expect(result.scanned).toBe(1);
    });

    it('структура отделов не прочиталась — прогон не падает, причина в предупреждениях', async () => {
        const { service, getFullDepartment } = makeService({});
        getFullDepartment.mockRejectedValue(new Error('портал не ответил'));

        const result = await service.runForDomain(DOMAIN, options());

        expect(result.scanned).toBe(0);
        expect(result.warnings.join(' | ')).toContain('портал не ответил');
        expect(result.warnings.join(' | ')).toContain(
            'структура отделов продаж пуста',
        );
    });
});
