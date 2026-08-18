import { PresentationPlanFactService } from '../services/presentation-plan-fact.service';

const DOMAIN = 'gsr.bitrix24.ru';

/** Слепок списка КПИ: тип/действие события, дата, ответственный, CRM. */
const salesList = {
    group: 'sales',
    type: 'kpi',
    bitrixId: '10',
    bitrixfields: [
        {
            code: 'sales_kpi_event_type',
            name: 'Тип события',
            bitrixId: 'PROPERTY_2',
            items: [
                {
                    code: 'sales_kpi_presentation',
                    name: 'Презентация',
                    bitrixId: 201,
                },
            ],
        },
        {
            code: 'sales_kpi_event_action',
            name: 'Действие',
            bitrixId: 'PROPERTY_3',
            items: [
                { code: 'sales_kpi_plan', name: 'План', bitrixId: 301 },
                { code: 'sales_kpi_done', name: 'Проведено', bitrixId: 302 },
            ],
        },
        {
            code: 'sales_kpi_event_date',
            name: 'Дата события',
            bitrixId: 'PROPERTY_1',
            items: [],
        },
        {
            code: 'sales_kpi_responsible',
            name: 'Ответственный',
            bitrixId: 'PROPERTY_4',
            items: [],
        },
        {
            code: 'sales_kpi_crm',
            name: 'CRM',
            bitrixId: 'PROPERTY_5',
            items: [],
        },
    ],
};

/** Запись-план презентации менеджера 187 на 14.08 по сделке 601. */
const planItem = (overrides?: Record<string, unknown>) => ({
    ID: 9001,
    NAME: 'Презентация План. ООО Ромашка',
    DATE_CREATE: '2026-08-13T10:00:00Z',
    PROPERTY_1: { 1: '14.08.2026' },
    PROPERTY_2: { 2: 201 },
    PROPERTY_3: { 3: 301 },
    PROPERTY_4: { 4: 187 },
    PROPERTY_5: { 5: 'D_601' },
    ...overrides,
});

const doneItem = (overrides?: Record<string, unknown>) => ({
    ...planItem({ ID: 9100, NAME: 'Презентация Проведено. ООО Ромашка' }),
    PROPERTY_3: { 3: 302 },
    ...overrides,
});

const makeDeps = (options?: {
    /** Ответы listItem.get по порядку вызовов (план, затем done). */
    listResponses?: Record<string, unknown>[][];
    rows?: Record<string, unknown>[];
    aisRecords?: Record<string, unknown>[];
}) => {
    const listItemGet = jest.fn();
    for (const response of options?.listResponses ?? [[planItem()], []]) {
        listItemGet.mockResolvedValueOnce({ result: response });
    }
    listItemGet.mockResolvedValue({ result: [] });
    const portal = {
        getListByCode: jest.fn(() => salesList),
        getIdByCodeFieldList: jest.fn(
            (list: { group: string; type: string }, code: string) =>
                salesList.bitrixfields.find(
                    field => field.code === `sales_kpi_${code}`,
                ),
        ),
    };
    const pbxService = {
        init: jest.fn().mockResolvedValue({
            bitrix: { listItem: { get: listItemGet } },
            PortalModel: portal,
        }),
    };
    const transcriptionStore = {
        findDoneInPeriod: jest.fn().mockResolvedValue(options?.rows ?? []),
    };
    const aiService = {
        findByTranscriptionIds: jest
            .fn()
            .mockResolvedValue(options?.aisRecords ?? []),
    };
    const service = new PresentationPlanFactService(
        pbxService as never,
        transcriptionStore as never,
        aiService as never,
    );
    return { service, listItemGet };
};

describe('PresentationPlanFactService (план-факт по презентациям)', () => {
    afterEach(() => jest.clearAllMocks());

    it('план подтверждается AI-разбором звонка-презентации того же менеджера рядом по дате', async () => {
        const { service } = makeDeps({
            rows: [
                {
                    id: '42',
                    userId: '187',
                    entityType: 'deal',
                    entityId: '999',
                    callStartedAt: new Date('2026-08-14T11:00:00Z'),
                },
            ],
            aisRecords: [
                {
                    transcription_id: '42',
                    type: 'agent-analysis',
                    user_result: { callType: 'presentation' },
                },
            ],
        });
        const result = await service.runForDomain(
            DOMAIN,
            new Date('2026-08-13T00:00:00Z'),
            new Date('2026-08-15T00:00:00Z'),
        );
        expect(result.planned).toBe(1);
        expect(result.confirmed).toBe(1);
        expect(result.missed).toBe(0);
        expect(result.items[0].status).toBe('confirmed');
    });

    it('без звонка, но с done-записью — «отчёт без звонка»; совсем без факта — пропуск', async () => {
        const { service } = makeDeps({
            listResponses: [
                // Планы: два — по сделке 601 и по сделке 777.
                [
                    planItem(),
                    planItem({
                        ID: 9002,
                        NAME: 'Презентация План. ООО Василёк',
                        PROPERTY_4: { 4: 44 },
                        PROPERTY_5: { 5: 'D_777' },
                    }),
                ],
                // Done-записи: только по сделке 601.
                [doneItem()],
            ],
        });
        const result = await service.runForDomain(
            DOMAIN,
            new Date('2026-08-13T00:00:00Z'),
            new Date('2026-08-15T00:00:00Z'),
        );
        expect(result.planned).toBe(2);
        expect(result.reportedOnly).toBe(1);
        expect(result.missed).toBe(1);
        const byId = Object.fromEntries(
            result.items.map(item => [item.recordId, item.status]),
        );
        expect(byId['9001']).toBe('reported-only');
        expect(byId['9002']).toBe('missed');
    });

    it('звонок-презентация ДРУГОГО менеджера и другой сделки план не подтверждает', async () => {
        const { service } = makeDeps({
            rows: [
                {
                    id: '42',
                    userId: '999',
                    entityType: 'deal',
                    entityId: '12345',
                    callStartedAt: new Date('2026-08-14T11:00:00Z'),
                },
            ],
            aisRecords: [
                {
                    transcription_id: '42',
                    type: 'agent-analysis',
                    user_result: { callType: 'presentation' },
                },
            ],
        });
        const result = await service.runForDomain(
            DOMAIN,
            new Date('2026-08-13T00:00:00Z'),
            new Date('2026-08-15T00:00:00Z'),
        );
        expect(result.confirmed).toBe(0);
        expect(result.missed).toBe(1);
    });

    it('планов нет — пустой результат без обращения к разборам', async () => {
        const { service } = makeDeps({ listResponses: [[], []] });
        const result = await service.runForDomain(
            DOMAIN,
            new Date(0),
            new Date(),
        );
        expect(result.planned).toBe(0);
        expect(result.items).toEqual([]);
    });
});
