import { ETimeZone } from '@lib/shared/lib/date';
import { groupDealsByClient } from '../lib/duplicate-groups';
import { DuplicateContextReader } from '../services/duplicate-context.reader';
import { makeDeal } from './fixtures/duplicate-report.fixture';

type Field = { bitrixId: string };
type Command = { key: string; filter: unknown; select: string[] };

const FIELDS: Record<string, Field> = {
    'company:op_inn': { bitrixId: 'OP_INN' },
    'lead:op_lead_site_status': { bitrixId: 'OP_LEAD_SITE_STATUS' },
};

const PORTAL = {
    getEntityFieldByCode: (entity: string, code: string) =>
        FIELDS[`${entity}:${code}`],
    getFieldBitrixId: (field: Field) => `UF_CRM_${field.bitrixId}`,
    getTimezone: () => ETimeZone.EUROPE_MOSCOW,
};

/** Битрикс, который пишет batch-команды в журнал и отдаёт ответы по ключам. */
const makeBitrix = (results: Record<string, unknown>) => {
    const commands: Command[] = [];
    const record = () => (key: string, filter: unknown, select: string[]) => {
        commands.push({ key, filter, select });
    };
    const bitrix = {
        batch: {
            company: { getList: jest.fn(record()) },
            contact: { getList: jest.fn(record()) },
            lead: { getList: jest.fn(record()) },
            task: { getList: jest.fn(record()) },
        },
        api: {
            callBatchWithConcurrency: jest
                .fn()
                .mockResolvedValue([{ result: results }]),
        },
        status: {
            getList: jest.fn().mockResolvedValue({
                result: [{ STATUS_ID: 'WEB', NAME: 'Заявка с веб-сайта' }],
            }),
        },
    };
    return { bitrix, commands };
};

const GROUPS = groupDealsByClient([
    makeDeal(1, { companyId: 100, sourceLeadId: 77 }),
    makeDeal(2, { companyId: 100 }),
    makeDeal(3, { companyId: null, contactId: 7 }),
    makeDeal(4, { companyId: null, contactId: 7 }),
]);

const RESULTS: Record<string, unknown> = {
    dr_company_0: [
        { ID: '100', TITLE: 'ООО Ромашка', UF_CRM_OP_INN: '3666 000 000' },
    ],
    dr_contact_0: [{ ID: '7', NAME: 'Иван', LAST_NAME: 'Иванов' }],
    dr_lead_0: [
        {
            ID: '77',
            TITLE: 'Заявка с сайта',
            DATE_CREATE: '2026-09-20T10:00:00+03:00',
            SOURCE_ID: 'WEB',
            UF_CRM_OP_LEAD_SITE_STATUS: '123',
        },
    ],
    dr_tasks_1: {
        tasks: [
            { id: '1', status: '2', responsibleId: '11' },
            // «Отложенная» — не в счёт.
            { id: '2', status: '6', responsibleId: '11' },
        ],
    },
    dr_tasks_2: { tasks: [] },
    dr_tasks_4: [
        { id: '5', status: '3', responsibleId: '12' },
        { id: '6', status: '4', responsibleId: '13' },
    ],
};

describe('DuplicateContextReader — второй проход отчёта', () => {
    it('одна очередь batch: компании, контакты, лиды по ID и задачи по сделке', async () => {
        const { bitrix, commands } = makeBitrix(RESULTS);

        await new DuplicateContextReader(bitrix as never, PORTAL as never).load(
            GROUPS,
            [],
        );

        expect(commands.map(command => command.key)).toEqual([
            'dr_company_0',
            'dr_contact_0',
            'dr_lead_0',
            'dr_tasks_1',
            'dr_tasks_2',
            'dr_tasks_3',
            'dr_tasks_4',
        ]);
        expect(commands[0]).toEqual({
            key: 'dr_company_0',
            filter: { ID: [100] },
            select: ['ID', 'TITLE', 'UF_CRM_OP_INN'],
        });
        expect(commands[2].select).toContain('UF_CRM_OP_LEAD_SITE_STATUS');
        expect(commands[3].filter).toEqual({
            UF_CRM_TASK: ['D_1'],
            '!STATUS': '5',
        });
        expect(bitrix.api.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
        // strict: упавший чанк роняет прогон, а не даёт тихо неполные задачи.
        expect(bitrix.api.callBatchWithConcurrency).toHaveBeenCalledWith(1, {
            strict: true,
        });
        expect(commands[3].select).toEqual(['ID', 'STATUS', 'RESPONSIBLE_ID']);
    });

    it('подписи клиентов, ИНН компании, лид с источником и меткой заявки, открытые задачи', async () => {
        const { bitrix } = makeBitrix(RESULTS);
        const warnings: string[] = [];

        const context = await new DuplicateContextReader(
            bitrix as never,
            PORTAL as never,
        ).load(GROUPS, warnings);

        expect(context.clientTitles.get('company:100')).toBe('ООО Ромашка');
        expect(context.clientTitles.get('contact:7')).toBe('Иванов Иван');
        expect(context.clientInns.get('company:100')).toBe('3666000000');
        expect(context.leads.get(77)).toEqual({
            id: 77,
            title: 'Заявка с сайта',
            createdAt: Date.parse('2026-09-20T07:00:00Z'),
            sourceName: 'Заявка с веб-сайта',
            isRequest: true,
        });
        expect([...context.openTasks]).toEqual([
            [1, [{ id: 1, responsibleId: 11 }]],
            [2, []],
            [
                4,
                [
                    { id: 5, responsibleId: 12 },
                    { id: 6, responsibleId: 13 },
                ],
            ],
        ]);
        // Задачи сделки 3 Битрикс не вернул — честное предупреждение.
        expect(warnings).toEqual([
            expect.stringContaining(
                'часть данных Битрикс не вернул (команд: 1)',
            ),
        ]);
    });

    it('ID пачками по 50: 51 компания — две команды', async () => {
        const deals = Array.from({ length: 51 }, (_, index) => [
            makeDeal(index * 2 + 1, { companyId: index + 1 }),
            makeDeal(index * 2 + 2, { companyId: index + 1 }),
        ]).flat();
        const { bitrix, commands } = makeBitrix({});

        await new DuplicateContextReader(bitrix as never, PORTAL as never).load(
            groupDealsByClient(deals),
            [],
        );

        const companies = commands.filter(command =>
            command.key.startsWith('dr_company_'),
        );
        expect(
            companies.map(
                command => (command.filter as { ID: number[] }).ID.length,
            ),
        ).toEqual([50, 1]);
    });

    it('справочник источников не прочитан — лиды без подписи источника, без падения', async () => {
        const { bitrix } = makeBitrix(RESULTS);
        bitrix.status.getList.mockRejectedValue(new Error('access denied'));

        const context = await new DuplicateContextReader(
            bitrix as never,
            PORTAL as never,
        ).load(GROUPS, []);

        expect(context.leads.get(77)?.sourceName).toBe('');
    });
});
