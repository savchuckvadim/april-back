import { ETimeZone } from '@lib/shared/lib/date';
import { DealAuditTasksReader } from '../services/deal-audit-tasks.reader';

/**
 * Задачи читаются только по сделкам прогона (05.10.2026). Раньше аудит
 * вычитывал все открытые задачи портала — до 400 страниц — и на большом
 * портале всё равно видел только самые старые: сделки выходили «без задач».
 */

type Row = Record<string, unknown>;

interface Command {
    key: string;
    filter: Row;
    select: string[];
    order: Row;
    start: number | undefined;
}

const makeBitrix = (results: Record<string, unknown>) => {
    const commands: Command[] = [];
    const callBatch = jest.fn().mockResolvedValue([{ result: results }]);
    const bitrix = {
        batch: {
            task: {
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
    return { bitrix, commands, callBatch };
};

const makeReader = (results: Record<string, unknown>) => {
    const harness = makeBitrix(results);
    const reader = new DealAuditTasksReader(
        harness.bitrix as never,
        ETimeZone.EUROPE_MOSCOW,
    );
    return { reader, ...harness };
};

describe('DealAuditTasksReader.loadFor', () => {
    it('по команде на сделку: привязки сделки и её компании, только предстоящие задачи, без total', async () => {
        const { reader, commands } = makeReader({});

        await reader.loadFor(
            [
                { dealId: 31077, companyId: 167221 },
                { dealId: 40, companyId: null },
            ],
            [],
        );

        expect(commands).toEqual([
            {
                key: 'audit_tasks_31077',
                filter: {
                    // Завершённые и «Ждёт контроля» отсекает сам Битрикс.
                    '!REAL_STATUS': ['4', '5'],
                    UF_CRM_TASK: ['D_31077', 'CO_167221'],
                },
                select: ['ID', 'DEADLINE', 'STATUS'],
                order: { deadline: 'ASC' },
                start: -1,
            },
            {
                key: 'audit_tasks_40',
                filter: {
                    '!REAL_STATUS': ['4', '5'],
                    UF_CRM_TASK: ['D_40'],
                },
                select: ['ID', 'DEADLINE', 'STATUS'],
                order: { deadline: 'ASC' },
                start: -1,
            },
        ]);
    });

    it('задачи раскладываются по сделкам, дедлайн — моментом времени', async () => {
        const { reader } = makeReader({
            audit_tasks_10: {
                tasks: [
                    {
                        id: '700',
                        status: '2',
                        deadline: '2026-10-21T13:50:00+03:00',
                    },
                    { id: '701', status: '3', deadline: null },
                ],
            },
            audit_tasks_20: { tasks: [] },
        });

        const index = await reader.loadFor(
            [
                { dealId: 10, companyId: 5 },
                { dealId: 20, companyId: null },
            ],
            [],
        );

        expect(index.forDeal(10)).toEqual([
            {
                id: 700,
                deadlineAt: new Date('2026-10-21T13:50:00+03:00').valueOf(),
            },
            { id: 701, deadlineAt: null },
        ]);
        expect(index.forDeal(20)).toEqual([]);
        expect(index.total).toBe(2);
    });

    it('«Ждёт контроля», отложенные и мусор задачами не считаются — сделка остаётся без задач', async () => {
        // Битрикс фильтр обычно отсекает их сам; проверка на стороне кода —
        // страховка на случай, если портал ответил шире фильтра.
        const { reader } = makeReader({
            audit_tasks_10: {
                tasks: [
                    {
                        id: '725659',
                        status: '4',
                        deadline: '2026-08-12T14:00:00+03:00',
                    },
                    { id: '726743', status: '6', deadline: null },
                    { id: '0', status: '2' },
                    null,
                ],
            },
        });

        const index = await reader.loadFor(
            [{ dealId: 10, companyId: null }],
            [],
        );

        expect(index.forDeal(10)).toEqual([]);
    });

    it('одна задача, привязанная и к сделке, и к компании, считается один раз', async () => {
        const { reader } = makeReader({
            audit_tasks_10: {
                tasks: [
                    { id: '700', status: '2' },
                    { id: '700', status: '2' },
                ],
            },
        });

        const index = await reader.loadFor([{ dealId: 10, companyId: 5 }], []);

        expect(index.forDeal(10)).toHaveLength(1);
    });

    it('сделка без ответа — предупреждение: её «без задач» может быть ложным', async () => {
        const warnings: string[] = [];
        const { reader } = makeReader({
            audit_tasks_10: { tasks: [{ id: '700', status: '2' }] },
        });

        const index = await reader.loadFor(
            [
                { dealId: 10, companyId: null },
                { dealId: 20, companyId: null },
                { dealId: 30, companyId: null },
            ],
            warnings,
        );

        expect(index.forDeal(20)).toEqual([]);
        expect(warnings).toEqual([
            'задачи не прочитаны по сделкам: 2 — у них признак «без задач» может быть ложным',
        ]);
    });

    it('пачка упала — задачи не учтены, прогон не падает', async () => {
        const warnings: string[] = [];
        const { reader, callBatch } = makeReader({});
        callBatch.mockRejectedValue(new Error('очередь занята'));

        const index = await reader.loadFor(
            [{ dealId: 10, companyId: null }],
            warnings,
        );

        expect(index.total).toBe(0);
        expect(warnings[0]).toContain('очередь занята');
    });

    it('сделок нет — ни одного запроса в Битрикс', async () => {
        const { reader, callBatch } = makeReader({});

        const index = await reader.loadFor([], []);

        expect(index.total).toBe(0);
        expect(callBatch).not.toHaveBeenCalled();
    });
});
