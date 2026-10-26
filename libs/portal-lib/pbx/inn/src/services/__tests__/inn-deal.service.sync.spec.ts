import { InnDealService } from '../inn-deal.service';
import { INN_CONFLICT_KINDS } from '../../type/inn.type';

const INN = '7707083893';
const OTHER = '7812032055';
const DEAL_INN = 'UF_CRM_OP_INN';
const POOL = 'UF_CRM_OP_INN_POOL';

type Row = Record<string, unknown>;

interface ICall {
    method: string;
    params: Row;
}

/** Одинаковые поля ИНН у сделки, компании и заявки — как на порталах. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : code === 'deal_from_lead_id'
                ? { bitrixId: 'FROM_LEAD' }
                : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

const setup = (fixture: {
    deal: Row;
    company?: Row | null;
    lead?: Row;
    /** Реквизиты компании 55 (`crm.requisite.list`). */
    requisites?: Row[];
    /** Реквизит, привязанный к сделке 100 (`crm.requisite.link.list`). */
    linkedRequisiteId?: number;
}) => {
    const calls: ICall[] = [];
    const rows: Record<string, unknown> = {
        'crm.deal.get': fixture.deal,
        'crm.company.get':
            fixture.company === undefined
                ? { ID: '55', TITLE: 'ООО «Ромашка»' }
                : fixture.company,
        'crm.lead.get': fixture.lead ?? null,
        'crm.deal.contact.items.get': [],
        'crm.timeline.comment.list': [],
    };
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: rows[method] ?? [] });
            },
        },
        requisite: {
            getList: () =>
                Promise.resolve({ result: fixture.requisites ?? [] }),
        },
        requisiteLink: {
            getList: () =>
                Promise.resolve({
                    result: fixture.linkedRequisiteId
                        ? [
                              {
                                  ENTITY_TYPE_ID: 2,
                                  ENTITY_ID: 100,
                                  REQUISITE_ID: fixture.linkedRequisiteId,
                              },
                          ]
                        : [],
                }),
        },
        requisitePreset: { getList: () => Promise.resolve({ result: [] }) },
    };
    return {
        calls,
        updates: (method: string) =>
            calls
                .filter(call => call.method === method)
                .map(call => call.params.fields as Row),
        service: new InnDealService(
            bitrix as never,
            portal,
            'portal.bitrix24.ru',
        ),
    };
};

/**
 * Текущий ИНН — один в сделке и в компании (владелец, 06.10.2026):
 * вкладка выравнивает пустую сторону, выбор пишет в обе.
 */
describe('InnDealService: текущий ИНН сделки и компании', () => {
    it('компанию прицепили позже — её пустой ИНН заполняется из сделки', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [DEAL_INN]: INN },
        });

        const snapshot = await fx.service.snapshot(100);

        expect(fx.updates('crm.company.update')).toEqual([
            { [POOL]: [INN], [DEAL_INN]: INN },
        ]);
        expect(fx.updates('crm.deal.update')).toEqual([]);
        expect(snapshot.current?.inn).toBe(INN);
    });

    it('в сделке пусто, в компании есть — ИНН переезжает в сделку с записью в ленте', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55' },
            company: { ID: '55', TITLE: 'ООО', [DEAL_INN]: INN },
        });

        const snapshot = await fx.service.snapshot(100);

        expect(fx.updates('crm.deal.update')).toEqual([
            { [DEAL_INN]: INN, [POOL]: [INN] },
        ]);
        expect(
            fx.calls.some(call => call.method === 'crm.timeline.comment.add'),
        ).toBe(true);
        expect(snapshot.current?.inn).toBe(INN);
    });

    it('ИНН есть только в заявке — ставится в сделку и в компанию', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', UF_CRM_FROM_LEAD: '7' },
            lead: { ID: '7', TITLE: 'Заявка', [DEAL_INN]: INN },
        });

        await fx.service.snapshot(100);

        expect(fx.updates('crm.deal.update')).toEqual([
            { [DEAL_INN]: INN, [POOL]: [INN] },
        ]);
        expect(fx.updates('crm.company.update')).toEqual([
            { [POOL]: [INN], [DEAL_INN]: INN },
        ]);
    });

    it('в сделке и компании разные — ничего не пишем, просим выбрать', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [DEAL_INN]: INN },
            company: { ID: '55', TITLE: 'ООО', [DEAL_INN]: OTHER },
        });

        const snapshot = await fx.service.snapshot(100);

        expect(fx.updates('crm.deal.update')).toEqual([]);
        expect(fx.updates('crm.company.update')).toEqual([]);
        expect(snapshot.conflicts.map(conflict => conflict.kind)).toContain(
            INN_CONFLICT_KINDS.current_mismatch,
        );
        expect(snapshot.candidates.map(item => item.inn)).toEqual(
            expect.arrayContaining([INN, OTHER]),
        );
    });

    it('закрытую сделку не трогаем даже при расхождении', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', CLOSED: 'Y', [DEAL_INN]: INN },
        });

        await fx.service.snapshot(100);

        expect(fx.updates('crm.company.update')).toEqual([]);
    });

    it('выбор пишет текущий ИНН и в сделку, и в компанию — поверх прежнего', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [DEAL_INN]: INN },
            company: { ID: '55', TITLE: 'ООО', [DEAL_INN]: OTHER },
        });
        const { version } = await fx.service.snapshot(100);

        // У компании другой ИНН — выбор перезаписывает его ИНН сделки.
        await fx.service.choose(100, {
            inn: INN,
            version,
            actor: { id: 1, name: 'Иван' },
        });

        expect(fx.updates('crm.deal.update').at(-1)).toMatchObject({
            [DEAL_INN]: INN,
        });
        expect(fx.updates('crm.company.update').at(-1)).toMatchObject({
            [DEAL_INN]: INN,
        });
    });

    /*
     * Владелец 25.10.2026: в сделке и компании пусто, пул пуст, а у компании
     * есть реквизит — берём его ИНН (привязанный к сделке или единственный).
     */
    const companyRq = (id: number, inn: string): Row => ({
        ID: String(id),
        ENTITY_TYPE_ID: '4',
        ENTITY_ID: '55',
        PRESET_ID: '1',
        NAME: 'Организация',
        RQ_INN: inn,
    });

    it('ИНН только в реквизите компании — в сделку, пул и компанию с записью в ленте', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55' },
            requisites: [companyRq(8, INN)],
        });

        const snapshot = await fx.service.snapshot(100);

        expect(fx.updates('crm.deal.update')).toEqual([
            { [DEAL_INN]: INN, [POOL]: [INN] },
        ]);
        expect(fx.updates('crm.company.update')).toEqual([
            { [POOL]: [INN], [DEAL_INN]: INN },
        ]);
        const audit = fx.calls.find(
            call => call.method === 'crm.timeline.comment.add',
        );
        expect(JSON.stringify(audit?.params)).toContain(
            'ИНН из реквизитов компании',
        );
        expect(snapshot.current?.inn).toBe(INN);
    });

    it('реквизитов с разными ИНН несколько — берём привязанный к сделке', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55' },
            requisites: [companyRq(8, OTHER), companyRq(9, INN)],
            linkedRequisiteId: 9,
        });

        await fx.service.snapshot(100);

        expect(fx.updates('crm.deal.update')).toEqual([
            { [DEAL_INN]: INN, [POOL]: [INN] },
        ]);
    });

    it('разные ИНН без привязки — не решаем за человека', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55' },
            requisites: [companyRq(8, OTHER), companyRq(9, INN)],
        });

        await fx.service.snapshot(100);

        expect(fx.updates('crm.deal.update')).toEqual([]);
    });

    it('в пуле сделки уже другой ИНН — не трогаем', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [POOL]: [OTHER] },
            requisites: [companyRq(8, INN)],
        });

        await fx.service.snapshot(100);

        expect(fx.updates('crm.deal.update')).toEqual([]);
    });

    it('лёгкое выравнивание без вкладки — то же правило, без заявок и ленты', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', UF_CRM_FROM_LEAD: '7' },
            lead: { ID: '7', TITLE: 'Заявка', [DEAL_INN]: OTHER },
            requisites: [companyRq(8, INN)],
        });

        const result = await fx.service.align(100);

        expect(result.current).toBe(INN);
        expect(fx.updates('crm.deal.update')).toEqual([
            { [DEAL_INN]: INN, [POOL]: [INN] },
        ]);
        // Лёгкое чтение: заявки, контакты и история не читаются.
        const methods = fx.calls.map(call => call.method);
        expect(methods).not.toContain('crm.lead.get');
        expect(methods).not.toContain('crm.deal.contact.items.get');
        expect(methods).not.toContain('crm.timeline.comment.list');
    });

    it('лёгкое выравнивание: ИНН уже есть — ничего не пишем и отдаём его', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [DEAL_INN]: INN },
            company: { ID: '55', TITLE: 'ООО', [DEAL_INN]: INN },
        });

        await expect(fx.service.align(100)).resolves.toEqual({
            current: INN,
            warnings: [],
        });
        expect(fx.updates('crm.deal.update')).toEqual([]);
        expect(fx.updates('crm.company.update')).toEqual([]);
    });

    it('выбор дописывает ИНН в заявку, только если у неё пусто', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', UF_CRM_FROM_LEAD: '7' },
            company: { ID: '55', TITLE: 'ООО', [DEAL_INN]: INN },
            lead: { ID: '7', TITLE: 'Заявка' },
        });
        const { version } = await fx.service.snapshot(100);

        await fx.service.choose(100, {
            inn: INN,
            version,
            actor: { id: 1, name: 'Иван' },
        });

        expect(fx.updates('crm.lead.update')).toEqual([
            { [DEAL_INN]: INN, [POOL]: [INN] },
        ]);
    });
});
