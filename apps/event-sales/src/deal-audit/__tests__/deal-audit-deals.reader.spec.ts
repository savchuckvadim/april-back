import { ETimeZone } from '@lib/shared/lib/date';
import { DealAuditDealsReader } from '../services/deal-audit-deals.reader';
import { DealAuditFields } from '../services/deal-audit-fields';
import { DealAuditTaskIndex } from '../services/deal-audit-tasks.reader';

/**
 * Выбор сделок для аудита (решение владельца, 05.10.2026): не вся воронка,
 * а не больше 50 самых давних открытых сделок «ОП Основная» на отдел
 * продаж. Раньше читалась вся воронка — 180 запросов подряд на портале в
 * девять тысяч открытых сделок.
 */

type Row = Record<string, unknown>;

interface Command {
    key: string;
    filter: Row;
    select: string[];
    order: Row;
    start: number | undefined;
}

const FIELDS: Record<string, string> = {
    call_next_date: 'CALL_NEXT_DATE',
    op_audit_status: 'OP_AUDIT_STATUS',
};

const makePortal = (hasCategory = true) => ({
    getDealCategoryByCode: () =>
        hasCategory
            ? {
                  bitrixId: '31',
                  stages: [
                      {
                          code: 'sales_warm',
                          name: 'Переговоры',
                          bitrixId: 'WARM',
                      },
                      {
                          code: 'sales_money_await',
                          name: 'В оплате',
                          bitrixId: 'MONEY_AWAIT',
                      },
                  ],
              }
            : undefined,
    getEntityFieldByCode: (_entity: string, code: string) =>
        FIELDS[code] ? { bitrixId: FIELDS[code] } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => ETimeZone.EUROPE_MOSCOW,
});

const fields = {
    names: { status: 'UF_CRM_OP_AUDIT_STATUS' },
    statusCodeByItemId: (raw: unknown) =>
        Number(raw) === 501 ? 'op_audit_status_idle' : null,
} as unknown as DealAuditFields;

/** Битрикс-заглушка: записывает команды пачки и отвечает по ключам. */
const makeBitrix = (results: Record<string, Row[]>, listRows: Row[] = []) => {
    const commands: Command[] = [];
    const getList = jest.fn().mockResolvedValue({ result: listRows });
    const callBatch = jest.fn().mockImplementation(() => {
        const queued = commands.map(command => command.key);
        const result: Record<string, Row[]> = {};
        for (const key of queued) {
            if (results[key]) result[key] = results[key];
        }
        return Promise.resolve([{ result }]);
    });
    const bitrix = {
        deal: { getList },
        batch: {
            deal: {
                getList: (
                    key: string,
                    filter: Row,
                    select: string[],
                    order: Row,
                    start?: number,
                ) => {
                    commands.push({ key, filter, select, order, start });
                },
            },
        },
        api: { callBatchWithConcurrency: callBatch },
    };
    return { bitrix, commands, getList, callBatch };
};

const makeReader = (
    results: Record<string, Row[]>,
    options: { hasCategory?: boolean; listRows?: Row[] } = {},
) => {
    const harness = makeBitrix(results, options.listRows);
    const reader = new DealAuditDealsReader(
        harness.bitrix as never,
        makePortal(options.hasCategory ?? true) as never,
        fields,
    );
    return { reader, ...harness };
};

const GROUPS = [
    { title: 'Отдел продаж 1', userIds: [11, 12] },
    { title: 'Отдел продаж 2', userIds: [21] },
];

const deals = (from: number, count: number): Row[] =>
    Array.from({ length: count }, (_, index) => ({ ID: String(from + index) }));

describe('DealAuditDealsReader.loadMostIdle', () => {
    it('по команде на отдел: открытые сделки ОП его сотрудников, самые давние первыми, без подсчёта total', async () => {
        const { reader, commands, callBatch } = makeReader({});

        await reader.loadMostIdle({ groups: GROUPS, limitPerGroup: 50 }, []);

        expect(commands[0]).toEqual({
            key: 'audit_group_0',
            filter: {
                CATEGORY_ID: '31',
                CLOSED: 'N',
                ASSIGNED_BY_ID: [11, 12],
            },
            select: expect.arrayContaining([
                'ID',
                'LAST_ACTIVITY_TIME',
                'MOVED_TIME',
                'UF_CRM_CALL_NEXT_DATE',
                'UF_CRM_OP_AUDIT_STATUS',
            ]) as string[],
            order: { LAST_ACTIVITY_TIME: 'ASC' },
            start: -1,
        });
        expect(commands[1].filter).toMatchObject({ ASSIGNED_BY_ID: [21] });
        // Все отделы — одной пачкой, а не запросом на отдел.
        expect(callBatch).toHaveBeenCalledTimes(1);
    });

    it('отдельная команда — сделки тех, кто не состоит в отделах продаж', async () => {
        const { reader, commands } = makeReader({});

        await reader.loadMostIdle({ groups: GROUPS, limitPerGroup: 50 }, []);

        expect(commands.map(command => command.key)).toEqual([
            'audit_group_0',
            'audit_group_1',
            'audit_group_outside',
        ]);
        expect(commands[2].filter).toEqual({
            CATEGORY_ID: '31',
            CLOSED: 'N',
            '!ASSIGNED_BY_ID': [11, 12, 21],
        });
    });

    it('с отдела — не больше лимита, а сделка из двух групп считается один раз', async () => {
        const { reader } = makeReader({
            audit_group_0: deals(1, 50),
            // Сделка 2 уже пришла от первого отдела.
            audit_group_1: [{ ID: '2' }, { ID: '900' }],
            audit_group_outside: [{ ID: '901' }],
        });

        const rows = await reader.loadMostIdle(
            { groups: GROUPS, limitPerGroup: 3 },
            [],
        );

        expect(rows.map(row => row['ID'])).toEqual([
            '1',
            '2',
            '3',
            '900',
            '901',
        ]);
    });

    it('лимит больше страницы Битрикса обрезается до 50', async () => {
        const { reader } = makeReader({ audit_group_0: deals(1, 50) });

        const rows = await reader.loadMostIdle(
            { groups: [GROUPS[0]], limitPerGroup: 500 },
            [],
        );

        expect(rows).toHaveLength(50);
    });

    it('отдел не прочитался — предупреждение, остальные отделы учтены', async () => {
        const warnings: string[] = [];
        const { reader } = makeReader({
            audit_group_1: [{ ID: '7' }],
            audit_group_outside: [],
        });

        const rows = await reader.loadMostIdle(
            { groups: GROUPS, limitPerGroup: 50 },
            warnings,
        );

        expect(rows.map(row => row['ID'])).toEqual(['7']);
        expect(warnings).toEqual([
            'сделки группы «Отдел продаж 1» не прочитаны',
        ]);
    });

    it('отделов нет — ни одного запроса и честное предупреждение', async () => {
        const warnings: string[] = [];
        const { reader, callBatch } = makeReader({});

        const rows = await reader.loadMostIdle(
            { groups: [], limitPerGroup: 50 },
            warnings,
        );

        expect(rows).toEqual([]);
        expect(callBatch).not.toHaveBeenCalled();
        expect(warnings[0]).toContain('структура отделов продаж пуста');
    });

    it('ручной прогон по сделкам — один запрос по id, отделы не читаются', async () => {
        const { reader, getList, callBatch } = makeReader(
            {},
            { listRows: [{ ID: '31077' }] },
        );

        const rows = await reader.loadMostIdle(
            { groups: GROUPS, limitPerGroup: 50, dealIds: [31077] },
            [],
        );

        expect(rows).toEqual([{ ID: '31077' }]);
        expect(callBatch).not.toHaveBeenCalled();
        expect(getList).toHaveBeenCalledWith(
            { CATEGORY_ID: '31', CLOSED: 'N', ID: [31077] },
            expect.any(Array),
            { LAST_ACTIVITY_TIME: 'ASC' },
            -1,
        );
    });

    it('воронка «ОП Основная» не настроена — доменная ошибка, а не тихий пропуск', async () => {
        const { reader } = makeReader({}, { hasCategory: false });

        await expect(
            reader.loadMostIdle({ groups: GROUPS, limitPerGroup: 50 }, []),
        ).rejects.toThrow('ОП Основная');
    });
});

describe('DealAuditDealsReader.toSnapshots', () => {
    it('собирает слепок: стадия по слепку портала, задачи сделки, прошлый статус', () => {
        const { reader } = makeReader({});
        const tasks = new DealAuditTaskIndex(
            new Map([[10, [{ id: 700, deadlineAt: null }]]]),
            1,
        );

        const [snapshot, bare] = reader.toSnapshots(
            [
                {
                    ID: '10',
                    TITLE: 'ТИК Левобережного района',
                    STAGE_ID: 'C31:MONEY_AWAIT',
                    ASSIGNED_BY_ID: '369',
                    COMPANY_ID: '167221',
                    LAST_ACTIVITY_TIME: '2026-09-01T10:00:00+03:00',
                    MOVED_TIME: '2026-08-20T10:00:00+03:00',
                    UF_CRM_CALL_NEXT_DATE: '',
                    UF_CRM_OP_AUDIT_STATUS: '501',
                },
                { ID: '11', STAGE_ID: 'C31:UNKNOWN' },
            ],
            tasks,
        );

        expect(snapshot).toMatchObject({
            dealId: 10,
            title: 'ТИК Левобережного района',
            stageCode: 'sales_money_await',
            stageName: 'В оплате',
            assignedById: 369,
            companyId: 167221,
            nextCallAt: null,
            openTasks: [{ id: 700, deadlineAt: null }],
            previousStatus: 'op_audit_status_idle',
        });
        expect(snapshot.lastActivityAt).toBe(
            new Date('2026-09-01T10:00:00+03:00').valueOf(),
        );
        expect(bare).toMatchObject({
            dealId: 11,
            title: 'Сделка #11',
            stageCode: null,
            assignedById: null,
            companyId: null,
            openTasks: [],
            previousStatus: null,
        });
    });
});
