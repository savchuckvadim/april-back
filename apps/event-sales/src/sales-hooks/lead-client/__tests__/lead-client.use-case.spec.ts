import { LeadClientUseCase } from '../use-cases/lead-client.use-case';
import { SalesHookExecutionContext } from '../../core/contracts/sales-hook-use-case.contract';

type Row = Record<string, unknown>;

function makeContext(deals: Record<number, Row | undefined>) {
    let nextId = 900;
    const call = (method: string, params: Row): Promise<unknown> => {
        const id = Number(params.id);
        if (method === 'crm.deal.get') {
            if (id === 666) return Promise.reject(new Error('portal down'));
            return Promise.resolve({ result: deals[id] });
        }
        if (method === 'crm.lead.get') {
            return Promise.resolve({
                result: { ID: String(id), NAME: 'Иван' },
            });
        }
        if (method.endsWith('.add'))
            return Promise.resolve({ result: ++nextId });
        return Promise.resolve({ result: method.endsWith('.get') ? {} : [] });
    };
    return {
        domain: 'p.ru',
        portal: {
            getEntityFieldByCode: () => undefined,
            getFieldBitrixId: () => '',
        },
        bitrix: { api: { call } },
    } as unknown as SalesHookExecutionContext;
}

const appSettings = {
    resolve: jest.fn().mockResolvedValue({
        leadClientCompanyDepartmentIds: '',
        leadWorkCopyActivitiesLimit: 50,
        // Хук работает и при выключенной настройке конвертации.
        leadWorkLinkClient: false,
    }),
};

describe('LeadClientUseCase', () => {
    it('создаёт клиента даже при выключенной настройке «клиент из заявки»', async () => {
        const useCase = new LeadClientUseCase(appSettings as never);

        const result = await useCase.execute(
            makeContext({ 100: { ID: '100', LEAD_ID: '42' } }),
            [{ dealId: 100 }],
        );

        expect(result.items[0].created).toEqual([
            { leadId: 42, type: 'contact', id: 901, reused: false },
        ]);
        expect(result.items[0].dealContactsAdded).toEqual([901]);
        expect(result.message).toContain('создано клиентов: 1');
    });

    it('ошибка одной сделки не валит пачку', async () => {
        const useCase = new LeadClientUseCase(appSettings as never);

        const result = await useCase.execute(
            makeContext({ 100: { ID: '100', LEAD_ID: '42' } }),
            [{ dealId: 666 }, { dealId: 100 }],
        );

        expect(result.items[0].warnings[0]).toContain('portal down');
        expect(result.items[1].created).toHaveLength(1);
    });

    it('сделка без лидов — ничего не делаем', async () => {
        const useCase = new LeadClientUseCase(appSettings as never);

        const result = await useCase.execute(
            makeContext({ 100: { ID: '100' } }),
            [{ dealId: 100 }],
        );

        expect(result.items[0]).toMatchObject({
            created: [],
            dealContactsAdded: [],
            warnings: [],
        });
    });
});
