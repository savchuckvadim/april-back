import { TransferWorkUseCase } from '../use-cases/transfer-work.use-case';

type Row = Record<string, unknown>;

const portal = {
    getEntityFieldByCode: () => undefined,
    getFieldBitrixId: (field: { bitrixId: string }) => field.bitrixId,
    getSalesTaskGroupId: () => null,
    getTimezone: () => 'Europe/Moscow',
    getDealCategoryByCode: (code: string) =>
        code === 'sales_base' ? { bitrixId: '3', stages: [] } : undefined,
};

/**
 * Битрикс-заглушка: чтение (scope и контакты) отвечает одним batch-ответом,
 * запись копится в журнал. Порядок событий — чтобы проверить, что чтение
 * контактов идёт до первой записи.
 */
function makeCtx(contacts: Row[]) {
    const events: string[] = [];
    const contactUpdates: { id: number; fields: Row }[] = [];
    const record = (name: string) => () => events.push(name);
    const buffer = {
        queue: (enqueue: () => void) => enqueue(),
        endGroup: jest.fn().mockResolvedValue(undefined),
        flush: jest.fn(() => {
            events.push('flush');
            return Promise.resolve();
        }),
    };
    const bitrix = {
        batch: {
            deal: {
                get: jest.fn(),
                getList: jest.fn(),
                contactItemsGet: jest.fn(),
                update: record('deal.update'),
            },
            company: {
                contactItemsGet: jest.fn(),
                update: record('company.update'),
            },
            contact: {
                update: (_cmd: string, id: number, fields: Row) => {
                    events.push('contact.update');
                    contactUpdates.push({ id, fields });
                },
            },
            task: { getList: jest.fn(), update: jest.fn(), add: jest.fn() },
        },
        api: {
            callBatchWithConcurrency: jest.fn(() => {
                events.push('read');
                return Promise.resolve([
                    {
                        result: {
                            scope_deal_1024: {
                                ID: '1024',
                                CATEGORY_ID: '3',
                                ASSIGNED_BY_ID: '5',
                                CLOSED: 'N',
                            },
                            crm_rel_ct_deal_1024: contacts,
                            crm_rel_ct_company_7: [{ CONTACT_ID: '302' }],
                        },
                    },
                ]);
            }),
        },
    };
    /** Резолвер имён: отмечаем момент вызова в общем журнале. */
    const userNames = {
        resolve: jest.fn(() => {
            events.push('names');
            return Promise.resolve({});
        }),
    };
    return {
        ctx: { bitrix, portal, buffer, domain: 'd.b24.ru' },
        events,
        contactUpdates,
        useCase: new TransferWorkUseCase(userNames as never),
    };
}

const ITEM = {
    action: 'give' as const,
    companyId: 7,
    dealIds: [1024],
    newResponsibleId: 8,
    includeOverdue: true,
    rescheduleOverdue: false,
    moveMainDealToCold: false,
    createCallTask: false,
};

describe('TransferWorkUseCase — контакты клиента', () => {
    /*
     * Решение владельца 17.09.2026: при передаче новый ответственный
     * ставится везде, в том числе на контактах сделки и компании.
     */
    it('контакты основной сделки и компании получают нового ответственного', async () => {
        const { ctx, contactUpdates, useCase } = makeCtx([
            { CONTACT_ID: '301' },
            { CONTACT_ID: '302' },
        ]);

        await useCase.execute(ctx as never, [ITEM]);

        expect(contactUpdates).toEqual([
            { id: 301, fields: { ASSIGNED_BY_ID: '8' } },
            { id: 302, fields: { ASSIGNED_BY_ID: '8' } },
        ]);
    });

    /*
     * Чтение тоже идёт batch'ем: отправь его после записи — оно увезёт
     * накопленные команды мимо буфера.
     */
    it('накопленное отправляется до чтения, контакты читаются до записи', async () => {
        const { ctx, events, useCase } = makeCtx([{ CONTACT_ID: '301' }]);

        await useCase.execute(ctx as never, [ITEM]);

        expect(events[0]).toBe('flush');
        const lastRead = events.lastIndexOf('read');
        const firstWrite = events.findIndex(event => event.endsWith('.update'));
        expect(lastRead).toBeLessThan(firstWrite);
    });

    /*
     * Резолвер имён сам шлёт batch: до чтений он увёз бы их команды, после
     * первой записи — закоммиченные группы буфера. Место одно — между.
     */
    it('имена резолвятся после всех чтений и до первой записи', async () => {
        const { ctx, events, useCase } = makeCtx([{ CONTACT_ID: '301' }]);

        await useCase.execute(ctx as never, [ITEM]);

        const names = events.indexOf('names');
        const firstWrite = events.findIndex(event => event.endsWith('.update'));
        expect(names).toBeGreaterThan(events.lastIndexOf('read'));
        expect(names).toBeLessThan(firstWrite);
    });

    it('больше десяти контактов — первые десять и предупреждение', async () => {
        const many = Array.from({ length: 12 }, (_, i) => ({
            CONTACT_ID: String(400 + i),
        }));
        const { ctx, contactUpdates, useCase } = makeCtx(many);

        const result = await useCase.execute(ctx as never, [ITEM]);

        expect(contactUpdates).toHaveLength(10);
        expect(result.warnings.join(' ')).toContain('первых 10');
    });
});
