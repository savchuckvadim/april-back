import { ClientTypeService } from '../services/client-type.service';
import {
    CLIENT_TYPE_SYNC_KINDS,
    planClientTypeSync,
} from '../lib/client-type-sync.plan';
import { ClientTypeNoTargetError } from '../lib/client-type.errors';

type Row = Record<string, unknown>;

const UF = 'UF_CRM_OP_CLIENT_TYPE';

/**
 * Варианты как на garant 26.10.2026: у сделки и компании id РАЗНЫЕ —
 * «Коммерческие» 5475 у сделки и 5697 у компании.
 */
const ITEMS = {
    deal: { state: 5473, commerc: 5475, ip: 5477 },
    company: { state: 5695, commerc: 5697, ip: 5699 },
};

const portalWith = (entities: ('deal' | 'company')[]) =>
    ({
        getEntityFieldByCode: (entity: 'deal' | 'company', code: string) =>
            code === 'op_client_type' && entities.includes(entity)
                ? {
                      bitrixId: 'OP_CLIENT_TYPE',
                      items: Object.entries(ITEMS[entity]).map(
                          ([itemCode, bitrixId]) => ({
                              code: itemCode,
                              bitrixId,
                          }),
                      ),
                  }
                : undefined,
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    }) as never;

const setup = (
    rows: { deal?: Row | null; company?: Row | null },
    entities: ('deal' | 'company')[] = ['deal', 'company'],
) => {
    const calls: { method: string; params: Row }[] = [];
    const result: Record<string, unknown> = {
        'crm.deal.get': rows.deal ?? null,
        'crm.company.get': rows.company ?? null,
    };
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: result[method] ?? true });
            },
        },
    };
    return {
        updates: (method: string) =>
            calls
                .filter(call => call.method === method)
                .map(call => ({
                    id: call.params.id,
                    fields: call.params.fields,
                })),
        service: new ClientTypeService(bitrix as never, portalWith(entities)),
    };
};

describe('planClientTypeSync', () => {
    it('пустая сторона заполняется из непустой', () => {
        expect(
            planClientTypeSync({ deal: null, company: 'ip', hasCompany: true }),
        ).toEqual({ kind: CLIENT_TYPE_SYNC_KINDS.toDeal, code: 'ip' });
        expect(
            planClientTypeSync({ deal: 'ip', company: null, hasCompany: true }),
        ).toEqual({ kind: CLIENT_TYPE_SYNC_KINDS.toCompany, code: 'ip' });
    });

    it('разные — конфликт; одинаковые, обе пустые или нет компании — ничего', () => {
        expect(
            planClientTypeSync({
                deal: 'ip',
                company: 'state',
                hasCompany: true,
            }).kind,
        ).toBe(CLIENT_TYPE_SYNC_KINDS.conflict);
        expect(
            planClientTypeSync({ deal: 'ip', company: 'ip', hasCompany: true })
                .kind,
        ).toBe(CLIENT_TYPE_SYNC_KINDS.none);
        expect(
            planClientTypeSync({ deal: null, company: null, hasCompany: true })
                .kind,
        ).toBe(CLIENT_TYPE_SYNC_KINDS.none);
        expect(
            planClientTypeSync({ deal: 'ip', company: null, hasCompany: false })
                .kind,
        ).toBe(CLIENT_TYPE_SYNC_KINDS.none);
    });
});

describe('ClientTypeService.align', () => {
    it('в сделке пусто — тип компании переносится по коду, а не по id', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55' },
            company: { ID: '55', [UF]: '5697' },
        });

        const state = await fx.service.align(100);

        expect(fx.updates('crm.deal.update')).toEqual([
            { id: 100, fields: { [UF]: 5475 } },
        ]);
        expect(state).toEqual({
            current: 'commerc',
            deal: 'commerc',
            company: 'commerc',
            conflict: false,
            warnings: [],
        });
    });

    it('в компании пусто — тип сделки уходит в компанию', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [UF]: '5477' },
            company: { ID: '55' },
        });

        await fx.service.align(100);

        expect(fx.updates('crm.company.update')).toEqual([
            { id: 55, fields: { [UF]: 5699 } },
        ]);
    });

    it('разные значения не трогаем — конфликт для человека', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [UF]: '5477' },
            company: { ID: '55', [UF]: '5695' },
        });

        const state = await fx.service.align(100);

        expect(fx.updates('crm.deal.update')).toEqual([]);
        expect(fx.updates('crm.company.update')).toEqual([]);
        expect(state.conflict).toBe(true);
        expect(state.current).toBe('state');
    });

    it('закрытую сделку не меняем', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', CLOSED: 'Y' },
            company: { ID: '55', [UF]: '5697' },
        });

        await fx.service.align(100);

        expect(fx.updates('crm.deal.update')).toEqual([]);
    });
});

describe('ClientTypeService.set', () => {
    it('выбор пишется и в открытую сделку, и в её компанию', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [UF]: '5473' },
            company: { ID: '55', [UF]: '5695' },
        });

        const state = await fx.service.set({ dealId: 100 }, 'ip');

        expect(fx.updates('crm.deal.update')).toEqual([
            { id: 100, fields: { [UF]: 5477 } },
        ]);
        expect(fx.updates('crm.company.update')).toEqual([
            { id: 55, fields: { [UF]: 5699 } },
        ]);
        expect(state).toMatchObject({ current: 'ip', conflict: false });
    });

    it('закрытая сделка — только компания', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', CLOSED: 'Y' },
        });

        const state = await fx.service.set({ dealId: 100 }, 'ip');

        expect(fx.updates('crm.deal.update')).toEqual([]);
        expect(fx.updates('crm.company.update')).toEqual([
            { id: 55, fields: { [UF]: 5699 } },
        ]);
        expect(state.current).toBe('ip');
    });

    it('поля нет ни у сделки, ни у компании — понятная ошибка', async () => {
        const fx = setup({ deal: { ID: '100', COMPANY_ID: '55' } }, []);
        await expect(
            fx.service.set({ dealId: 100 }, 'ip'),
        ).rejects.toBeInstanceOf(ClientTypeNoTargetError);
    });
});
