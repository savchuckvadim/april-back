import { ETimeZone } from '@lib/shared/lib/date';
import {
    DuplicateDealsReader,
    SALES_BASE_MISSING,
} from '../services/duplicate-deals.reader';

type Field = { bitrixId: string };

const CATEGORY = {
    bitrixId: '31',
    stages: [
        { bitrixId: 'NEW', code: 'sales_new', name: 'Новая' },
        { bitrixId: 'PREPARATION', code: 'sales_pres', name: 'Презентация' },
    ],
};

/** Слепок портала: воронка 31 и наши поля сделки. */
const makePortal = (
    fields: Record<string, Field> = {
        'deal:deal_from_lead_id': { bitrixId: 'DEAL_FROM_LEAD_ID' },
        'deal:deal_joined_leads': { bitrixId: 'DEAL_JOINED_LEADS' },
        'deal:op_inn': { bitrixId: 'OP_INN' },
    },
) => ({
    getDealCategoryByCode: jest
        .fn<typeof CATEGORY | undefined, [string]>()
        .mockReturnValue(CATEGORY),
    getEntityFieldByCode: jest.fn(
        (entity: string, code: string) => fields[`${entity}:${code}`],
    ),
    getFieldBitrixId: jest.fn((field: Field) => `UF_CRM_${field.bitrixId}`),
    getTimezone: () => ETimeZone.EUROPE_MOSCOW,
});

const ROWS = [
    {
        ID: '1',
        TITLE: ' ООО Ромашка ',
        STAGE_ID: 'C31:PREPARATION',
        ASSIGNED_BY_ID: '11',
        CREATED_BY_ID: '447',
        COMPANY_ID: '100',
        CONTACT_ID: '0',
        OPPORTUNITY: '55524.00',
        DATE_CREATE: '2026-09-01T10:00:00+03:00',
        DATE_MODIFY: '30.09.2026 12:00:00',
        LAST_ACTIVITY_TIME: '2026-09-29T15:00:00+03:00',
        LAST_ACTIVITY_BY: '11',
        LEAD_ID: '5',
        UF_CRM_DEAL_FROM_LEAD_ID: 'L_77',
        UF_CRM_DEAL_JOINED_LEADS: ['L_8', 'L_9'],
        UF_CRM_OP_INN: '3666 123 456',
    },
    {
        ID: '2',
        TITLE: '',
        STAGE_ID: 'C31:LOST_STAGE',
        ASSIGNED_BY_ID: '12',
        CREATED_BY_ID: '12',
        COMPANY_ID: null,
        CONTACT_ID: '7',
        OPPORTUNITY: '0',
        DATE_CREATE: '2026-09-20T10:00:00+03:00',
        DATE_MODIFY: '2026-09-21T10:00:00+03:00',
        LEAD_ID: '5',
        UF_CRM_DEAL_FROM_LEAD_ID: '',
        UF_CRM_DEAL_JOINED_LEADS: false,
        UF_CRM_OP_INN: '',
    },
];

describe('DuplicateDealsReader — открытые сделки воронки «ОП Основная»', () => {
    it('читает все открытые сделки воронки с нашими полями', async () => {
        const all = jest.fn().mockResolvedValue(ROWS);
        const reader = new DuplicateDealsReader(
            { deal: { all } } as never,
            makePortal() as never,
        );

        await reader.load();

        const [filter, select] = all.mock.calls[0] as [unknown, string[]];
        expect(filter).toEqual({ CATEGORY_ID: '31', CLOSED: 'N' });
        expect(select).toEqual(
            expect.arrayContaining([
                'DATE_MODIFY',
                'LAST_ACTIVITY_TIME',
                'LAST_ACTIVITY_BY',
                'CREATED_BY_ID',
                'CONTACT_ID',
                'UF_CRM_DEAL_FROM_LEAD_ID',
                'UF_CRM_DEAL_JOINED_LEADS',
                'UF_CRM_OP_INN',
            ]),
        );
    });

    it('по клиенту: открытые сделки воронки компании или контакта — тот же разбор', async () => {
        const all = jest.fn().mockResolvedValue(ROWS);
        const reader = new DuplicateDealsReader(
            { deal: { all } } as never,
            makePortal() as never,
        );

        await reader.loadForClient({ companyId: 100 });
        await reader.loadForClient({ contactId: 7 });

        expect(all.mock.calls.map(([filter]) => filter as unknown)).toEqual([
            { COMPANY_ID: '100', CATEGORY_ID: '31', CLOSED: 'N' },
            { CONTACT_ID: '7', CATEGORY_ID: '31', CLOSED: 'N' },
        ]);
    });

    it('разбирает стадию, лид, присоединённые заявки, ИНН и даты', async () => {
        const reader = new DuplicateDealsReader(
            { deal: { all: jest.fn().mockResolvedValue(ROWS) } } as never,
            makePortal() as never,
        );

        const [first, second] = await reader.load();

        expect(first).toMatchObject({
            id: 1,
            title: 'ООО Ромашка',
            stageName: 'Презентация',
            stageOrder: 4,
            assignedById: 11,
            createdById: 447,
            companyId: 100,
            contactId: null,
            opportunity: 55524,
            sourceLeadId: 77,
            joinedLeads: 2,
            inn: '3666123456',
            openTasks: 0,
            ownOpenTasks: 0,
            openTaskIds: [],
            lastActivityById: 11,
            lead: null,
        });
        expect(first.createdAt).toBe(Date.parse('2026-09-01T07:00:00Z'));
        expect(first.modifiedAt).toBe(Date.parse('2026-09-30T09:00:00Z'));
        expect(first.lastActivityAt).toBe(Date.parse('2026-09-29T12:00:00Z'));
        expect(second).toMatchObject({
            id: 2,
            title: '',
            stageName: 'C31:LOST_STAGE',
            stageOrder: 0,
            companyId: null,
            contactId: 7,
            // Наше поле пусто — штатный LEAD_ID.
            sourceLeadId: 5,
            joinedLeads: 0,
            inn: '',
        });
    });

    it('поля не установлены — читаются только штатные, ИНН пуст', async () => {
        const all = jest
            .fn<Promise<unknown[]>, [unknown, string[]]>()
            .mockResolvedValue([ROWS[0]]);
        const reader = new DuplicateDealsReader(
            { deal: { all } } as never,
            makePortal({}) as never,
        );

        const [deal] = await reader.load();

        const select = all.mock.calls[0][1];
        expect(select.some(name => name.startsWith('UF_'))).toBe(false);
        expect(deal.inn).toBe('');
        expect(deal.sourceLeadId).toBe(5);
    });

    it('воронка не настроена — доменная ошибка, а не литерал категории', async () => {
        const portal = makePortal();
        portal.getDealCategoryByCode.mockReturnValue(undefined);
        const all = jest.fn();
        const reader = new DuplicateDealsReader(
            { deal: { all } } as never,
            portal as never,
        );

        await expect(reader.load()).rejects.toThrow(SALES_BASE_MISSING);
        expect(all).not.toHaveBeenCalled();
    });
});
