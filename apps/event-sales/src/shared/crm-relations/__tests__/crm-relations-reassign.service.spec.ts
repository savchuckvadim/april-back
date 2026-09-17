import { BitrixService } from '@/modules/bitrix';
import { CrmRelationsReassignService } from '../crm-relations-reassign.service';

/**
 * Контакты клиента по поверхностным связям: чтение одним batch-проводом,
 * запись — независимыми командами в буфер вызывающего.
 */
type Row = Record<string, unknown>;

const makeBitrix = (answers: Record<string, unknown>) => {
    const sent: string[] = [];
    const rec = (key: string) => {
        sent.push(key);
    };
    const leadGetList = jest.fn<void, [string, Row, string[]]>(key => rec(key));
    const contactUpdate = jest.fn<void, [string, number, Row]>();
    const callBatchWithConcurrency = jest.fn<
        Promise<Array<{ result: Row }>>,
        []
    >(() => {
        const result: Row = {};
        for (const key of sent) result[key] = answers[key];
        sent.length = 0;
        return Promise.resolve([{ result }]);
    });
    const bitrix = {
        api: { callBatchWithConcurrency },
        batch: {
            deal: { contactItemsGet: jest.fn(rec) },
            lead: { contactItemsGet: jest.fn(rec), getList: leadGetList },
            company: { contactItemsGet: jest.fn(rec) },
            contact: { update: contactUpdate },
        },
    };
    return {
        bitrix,
        service: new CrmRelationsReassignService(
            bitrix as unknown as BitrixService,
        ),
        callBatchWithConcurrency,
        leadGetList,
        contactUpdate,
    };
};

describe('CrmRelationsReassignService.collectContactIds', () => {
    it('собирает контакты сделок, лидов (CONTACT_ID + items) и компаний без дублей', async () => {
        const fake = makeBitrix({
            crm_rel_ct_deal_500: [{ CONTACT_ID: '9' }, { CONTACT_ID: '10' }],
            crm_rel_ct_lead_12: [{ CONTACT_ID: 10, IS_PRIMARY: 'Y' }],
            crm_rel_ct_leads_0: [{ ID: '12', CONTACT_ID: '11' }],
            crm_rel_ct_company_7: [{ CONTACT_ID: '9' }, { CONTACT_ID: '14' }],
        });

        const ids = await fake.service.collectContactIds({
            dealIds: [500, 500],
            leadIds: [12],
            companyIds: [7],
        });

        expect(ids.sort((a, b) => a - b)).toEqual([9, 10, 11, 14]);
        expect(fake.callBatchWithConcurrency).toHaveBeenCalledTimes(1);
        expect(fake.bitrix.batch.deal.contactItemsGet).toHaveBeenCalledTimes(1);
        expect(fake.leadGetList).toHaveBeenCalledWith(
            'crm_rel_ct_leads_0',
            { ID: [12] },
            ['ID', 'CONTACT_ID'],
        );
    });

    it('пустой охват — ни одного запроса', async () => {
        const fake = makeBitrix({});
        expect(
            await fake.service.collectContactIds({
                dealIds: [],
                leadIds: [0, Number.NaN],
                companyIds: [],
            }),
        ).toEqual([]);
        expect(fake.callBatchWithConcurrency).not.toHaveBeenCalled();
    });

    it('чужие ключи ответа и пустые CONTACT_ID не попадают в результат', async () => {
        const fake = makeBitrix({
            crm_rel_ct_leads_0: [{ ID: '12', CONTACT_ID: null }],
            crm_rel_ct_lead_12: [],
        });
        fake.callBatchWithConcurrency.mockResolvedValueOnce([
            {
                result: {
                    foreign_cmd: [{ CONTACT_ID: '99' }],
                    crm_rel_ct_leads_0: [{ ID: '12', CONTACT_ID: '' }],
                },
            },
        ]);

        expect(
            await fake.service.collectContactIds({
                dealIds: [],
                leadIds: [12],
                companyIds: [],
            }),
        ).toEqual([]);
    });

    it('фильтр лидов режется по 50 id', async () => {
        const fake = makeBitrix({});
        const leadIds = Array.from({ length: 51 }, (_, i) => i + 1);

        await fake.service.collectContactIds({
            dealIds: [],
            leadIds,
            companyIds: [],
        });

        expect(fake.leadGetList.mock.calls.map(([key]) => key)).toEqual([
            'crm_rel_ct_leads_0',
            'crm_rel_ct_leads_50',
        ]);
        expect(fake.leadGetList.mock.calls[1][1]).toEqual({ ID: [51] });
    });

    it('сбой батча не роняет вызывающего — пустой список', async () => {
        const fake = makeBitrix({});
        fake.callBatchWithConcurrency.mockRejectedValueOnce(new Error('boom'));

        expect(
            await fake.service.collectContactIds({
                dealIds: [1],
                leadIds: [],
                companyIds: [],
            }),
        ).toEqual([]);
    });
});

describe('CrmRelationsReassignService.queueContactsResponsible', () => {
    const buffer = () => ({ queue: (fn: () => void) => fn() });

    it('ставит contact.update с ответственным на каждый контакт, ключи уникальны', () => {
        const fake = makeBitrix({});

        fake.service.queueContactsResponsible(
            buffer(),
            [9, 10, 9],
            447,
            'xo2_h1',
        );

        expect(fake.contactUpdate.mock.calls).toEqual([
            ['xo2_h1_contact_9', 9, { ASSIGNED_BY_ID: '447' }],
            ['xo2_h1_contact_10', 10, { ASSIGNED_BY_ID: '447' }],
        ]);
    });

    it('без ответственного ничего не пишет', () => {
        const fake = makeBitrix({});

        fake.service.queueContactsResponsible(buffer(), [9], 0, 'xo2_h1');

        expect(fake.contactUpdate).not.toHaveBeenCalled();
    });

    it('команды откладываются в буфер, а не уходят сразу', () => {
        const fake = makeBitrix({});
        const queued: Array<() => void> = [];

        fake.service.queueContactsResponsible(
            { queue: fn => queued.push(fn) },
            [9],
            447,
            'xo2_h1',
        );

        expect(fake.contactUpdate).not.toHaveBeenCalled();
        queued.forEach(fn => fn());
        expect(fake.contactUpdate).toHaveBeenCalledTimes(1);
    });
});
