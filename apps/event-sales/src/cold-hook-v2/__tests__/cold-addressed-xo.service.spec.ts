import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { LeadRequestAcceptService } from '../../lead-request/services/lead-request-accept.service';
import { IBatchGroupBuffer } from '../../shared/batch';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../dto/cold.dto';
import {
    ColdAddressedXoPlan,
    ColdAddressedXoV2Service,
} from '../services/addressed-xo/cold-addressed-xo.service';
import { ColdRelations } from '../services/relations/cold-relations.types';
import { ColdTarget } from '../services/target/cold-target.types';

/**
 * «Адресный ХО везде»: что читается (лиды входной и сохранённой основной,
 * контакты сделок/лидов/компании) и как пишется (независимые группы ≤ 50).
 */
type Row = Record<string, unknown>;

const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'deal_from_lead_id'
            ? { bitrixId: 'DEAL_FROM_LEAD_ID', items: [] }
            : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
    getLeadStatusIdByCode: () => undefined,
    getLeadStageCodeByStatusId: () => undefined,
    getDealCategoryByCode: () => undefined,
} as unknown as PortalModel;

const makeBitrix = (leads: Row[]) => {
    const calls: Array<[string, string, unknown]> = [];
    const rec = (name: string) => (key: string, arg: unknown) =>
        calls.push([name, key, arg]);
    const bitrix = {
        api: {
            callBatchWithConcurrency: jest.fn(() =>
                Promise.resolve([
                    {
                        result: {
                            crm_rel_ct_company_7: [{ CONTACT_ID: '70' }],
                        },
                    },
                ]),
            ),
        },
        lead: {
            getList: jest.fn(() => Promise.resolve({ result: leads })),
        },
        batch: {
            deal: { contactItemsGet: jest.fn(rec('deal.contacts')) },
            lead: {
                contactItemsGet: jest.fn(rec('lead.contacts')),
                getList: jest.fn(rec('lead.list')),
                update: jest.fn(rec('lead.update')),
            },
            company: { contactItemsGet: jest.fn(rec('company.contacts')) },
            contact: { update: jest.fn(rec('contact.update')) },
        },
    };
    return { bitrix, calls };
};

const target: ColdTarget = {
    hookKey: 'h1',
    hook: {
        entityType: EnumColdCallEntityType.COMPANY,
        entityId: '7',
        responsible: '447',
        isTmc: EnumColdCallIsTmc.N,
        force: EnumColdCallForce.Y,
    },
    kind: 'company',
    company: { ID: '7' } as never,
    companyId: 7,
    entryDeal: null,
    rootDealId: null,
};

const relations = (leadIds: number[]): ColdRelations => ({
    deals: [],
    openBaseDeals: [],
    dealIds: [],
    leadIds,
    tasks: [],
    pres: { info: null, rows: [] },
    zpr: { info: null, rows: [] },
});

const makeService = (leads: Row[] = []) => {
    const fake = makeBitrix(leads);
    const service = new ColdAddressedXoV2Service(
        portal,
        fake.bitrix as unknown as BitrixService,
        new LeadRequestAcceptService(null as never),
    );
    return { service, ...fake };
};

/** Буфер, который помнит размер каждой закрытой группы. */
const makeBuffer = () => {
    const groups: number[] = [];
    let current: Array<() => void> = [];
    const buffer = {
        queue: (fn: () => void) => current.push(fn),
        endGroup: () => {
            if (current.length) {
                groups.push(current.length);
                current.forEach(fn => fn());
                current = [];
            }
            return Promise.resolve();
        },
    } as unknown as IBatchGroupBuffer;
    return { buffer, groups };
};

describe('ColdAddressedXoV2Service.load', () => {
    it('лиды — входной сделки и сохранённой основной; контакты — основной, открытых лидов и компании', async () => {
        const fake = makeService([
            { ID: '12', ASSIGNED_BY_ID: '448', STATUS_SEMANTIC_ID: 'P' },
            { ID: '13', ASSIGNED_BY_ID: '448', STATUS_SEMANTIC_ID: 'S' },
        ]);
        const preserved = {
            ID: '500',
            LEAD_ID: '13',
            UF_CRM_DEAL_FROM_LEAD_ID: 'L_12',
        } as unknown as IBXDeal;

        const plan = await fake.service.load(
            target,
            relations([12, 14]),
            preserved,
        );

        expect(fake.bitrix.lead.getList).toHaveBeenCalledWith(
            { ID: [12, 14, 13] },
            expect.any(Array),
        );
        // Закрытый лид 13 отсеян — и его контакты не читаются.
        expect(plan.leads.map(lead => lead.leadId)).toEqual([12]);
        expect(fake.calls.filter(([name]) => name !== 'lead.list')).toEqual([
            ['deal.contacts', 'crm_rel_ct_deal_500', 500],
            ['lead.contacts', 'crm_rel_ct_lead_12', 12],
            ['company.contacts', 'crm_rel_ct_company_7', 7],
        ]);
        expect(plan.contactIds).toEqual([70]);
    });

    it('без лидов и основной — лиды не читаются, контакты только компании', async () => {
        const fake = makeService();

        const plan = await fake.service.load(target, relations([]), null);

        expect(fake.bitrix.lead.getList).not.toHaveBeenCalled();
        expect(fake.calls.map(([name]) => name)).toEqual(['company.contacts']);
        expect(plan).toEqual({ leads: [], contactIds: [70] });
    });
});

describe('ColdAddressedXoV2Service.queue', () => {
    it('много контактов — независимые группы, ни одна не больше 50', async () => {
        const fake = makeService();
        const { buffer, groups } = makeBuffer();
        const plan: ColdAddressedXoPlan = {
            leads: [],
            contactIds: Array.from({ length: 73 }, (_, i) => i + 1),
        };

        await fake.service.queue('h1', plan, 447, {}, buffer);

        const updates = fake.calls.filter(
            ([name]) => name === 'contact.update',
        );
        expect(updates).toHaveLength(73);
        expect(groups.reduce((sum, size) => sum + size, 0)).toBe(73);
        expect(Math.max(...groups)).toBeLessThanOrEqual(50);
        expect(updates[0][1]).toBe('xo2_h1_contact_1');
    });

    it('лиды уходят своей группой до контактов', async () => {
        const fake = makeService();
        const { buffer, groups } = makeBuffer();
        const [lead] = await makeService([
            { ID: '12', ASSIGNED_BY_ID: '448', STATUS_SEMANTIC_ID: 'P' },
        ])
            .service.load(target, relations([12]), null)
            .then(p => p.leads);

        await fake.service.queue(
            'h1',
            { leads: [lead], contactIds: [70] },
            447,
            {},
            buffer,
        );

        expect(fake.calls.map(([name, key]) => [name, key])).toEqual([
            ['lead.update', 'xo2_lead_h1_12'],
            ['contact.update', 'xo2_h1_contact_70'],
        ]);
        expect(groups).toEqual([1, 1]);
    });

    it('пустой план — ни одной команды', async () => {
        const fake = makeService();
        const { buffer, groups } = makeBuffer();

        await fake.service.queue(
            'h1',
            { leads: [], contactIds: [] },
            447,
            {},
            buffer,
        );

        expect(fake.calls).toEqual([]);
        expect(groups).toEqual([]);
    });
});

describe('ColdAddressedXoV2Service.responsibleIds', () => {
    it('прежние ответственные лидов — для имён', () => {
        expect(
            ColdAddressedXoV2Service.responsibleIds({
                leads: [
                    { leadId: 1, responsibleId: 448, waiting: true, row: {} },
                    { leadId: 2, responsibleId: null, waiting: false, row: {} },
                ],
                contactIds: [],
            }),
        ).toEqual([448]);
    });
});
