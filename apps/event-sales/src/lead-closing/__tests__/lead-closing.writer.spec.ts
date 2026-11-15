import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { LeadClosingCase } from '../lead-closing.reader';
import { LeadClosingWriter } from '../lead-closing.writer';

const STATUSES: Record<string, string> = {
    lead_converted: 'CONVERTED',
    lead_junk: '2',
    lead_apology: '3',
};

const setup = (statuses: Record<string, string> = STATUSES) => {
    const leadUpdate = jest.fn();
    const itemUpdate = jest.fn();
    const bitrix = {
        batch: { lead: { update: leadUpdate }, item: { update: itemUpdate } },
    } as unknown as BitrixService;
    const portal = {
        getLeadStatusIdByCode: (code: string) => statuses[code],
    } as unknown as PortalModel;
    return {
        writer: new LeadClosingWriter(bitrix, portal),
        leadUpdate,
        itemUpdate,
    };
};

const item = (
    over: Partial<LeadClosingCase> & {
        leadId?: number;
        linkDealId?: number | null;
    },
): LeadClosingCase => ({
    lead: {
        id: over.leadId ?? 1,
        statusId: 'PBX_TAKEN_IN_WORK',
        companyId: 0,
        contactId: 0,
        dealId: 10,
    },
    input: {
        deal: { id: 10, stage: 'sales_warm' },
        liveBaseDealId: null,
        hasOpenWorkElsewhere: false,
    },
    decision: {
        target: 'lead_converted',
        linkDealId: over.linkDealId === undefined ? 10 : over.linkDealId,
        reason: 'deal_open',
    },
    linkDealLeadId: 0,
    ...over,
    linkDealAssignedId: over.linkDealAssignedId ?? 0,
    linkCompany: over.linkCompany ?? null,
});

describe('LeadClosingWriter', () => {
    it('закрывает лид и ставит «Лид» в пустое поле сделки через crm.item', () => {
        const { writer, leadUpdate, itemUpdate } = setup();
        const [entry] = writer.queue([item({})]);

        expect(leadUpdate).toHaveBeenCalledWith('lc_lead_1', 1, {
            STATUS_ID: 'CONVERTED',
        });
        expect(itemUpdate).toHaveBeenCalledWith(
            'lc_link_1',
            10,
            BitrixOwnerTypeId.DEAL,
            { leadId: 1 },
        );
        expect(entry).toMatchObject({
            statusBefore: 'PBX_TAKEN_IN_WORK',
            statusAfter: 'CONVERTED',
            linkAction: 'set',
        });
    });

    it('чужой лид в поле сделки не перетирается; одна сделка — одному лиду', () => {
        const { writer, itemUpdate } = setup();
        const entries = writer.queue([
            item({ leadId: 1 }),
            item({ leadId: 2 }),
            item({ leadId: 3, linkDealLeadId: 77 }),
        ]);

        expect(entries.map(e => e.linkAction)).toEqual([
            'set',
            'taken',
            'taken',
        ]);
        expect(itemUpdate).toHaveBeenCalledTimes(1);
    });

    it('лид, у которого всё уже стоит, ничего не пишет', () => {
        const { writer, leadUpdate, itemUpdate } = setup();
        const [entry] = writer.queue([
            item({
                lead: {
                    id: 1,
                    statusId: 'CONVERTED',
                    companyId: 0,
                    contactId: 0,
                    dealId: 10,
                },
                linkDealLeadId: 1,
            }),
        ]);

        expect(entry).toMatchObject({
            leadCmd: null,
            linkCmd: null,
            linkAction: 'already',
        });
        expect(leadUpdate).not.toHaveBeenCalled();
        expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('«не трогаем» в журнал и в batch не попадает', () => {
        const { writer, leadUpdate } = setup();
        const entries = writer.queue([
            item({
                decision: {
                    target: null,
                    linkDealId: null,
                    reason: 'deleted_no_live',
                },
            }),
        ]);

        expect(entries).toEqual([]);
        expect(leadUpdate).not.toHaveBeenCalled();
    });

    it('несопоставленный статус — ошибка до записи', () => {
        const { writer, leadUpdate } = setup({ lead_converted: 'CONVERTED' });
        expect(() =>
            writer.queue([
                item({}),
                item({
                    decision: {
                        target: 'lead_apology',
                        linkDealId: 10,
                        reason: 'apology_no_work',
                    },
                }),
            ]),
        ).toThrow('«Не состоялась»');
        expect(leadUpdate).not.toHaveBeenCalled();
    });

    it('откат возвращает прежний статус и очищает «Лид» только там, где ставили', () => {
        const { writer, leadUpdate, itemUpdate } = setup();
        const entries = writer.queue([
            item({ leadId: 1 }),
            item({ leadId: 2 }),
        ]);
        leadUpdate.mockClear();
        itemUpdate.mockClear();

        writer.queueRollback(entries);

        expect(leadUpdate).toHaveBeenCalledWith('lc_lead_1_rb', 1, {
            STATUS_ID: 'PBX_TAKEN_IN_WORK',
        });
        expect(leadUpdate).toHaveBeenCalledWith('lc_lead_2_rb', 2, {
            STATUS_ID: 'PBX_TAKEN_IN_WORK',
        });
        expect(itemUpdate).toHaveBeenCalledTimes(1);
        expect(itemUpdate).toHaveBeenCalledWith(
            'lc_link_1_rb',
            10,
            BitrixOwnerTypeId.DEAL,
            { leadId: 0 },
        );
    });
    it('«Лид» сделки занят — ставим в «Лид» компании, если там пусто', () => {
        const { writer, itemUpdate } = setup();
        const entries = writer.queue([
            item({
                leadId: 1,
                linkDealLeadId: 77,
                linkCompany: { id: 500, leadId: 0 },
            }),
            item({
                leadId: 2,
                linkDealLeadId: 77,
                linkCompany: { id: 500, leadId: 0 },
            }),
            item({
                leadId: 3,
                linkDealLeadId: 77,
                linkCompany: { id: 600, leadId: 99 },
            }),
        ]);

        expect(entries.map(e => e.linkAction)).toEqual([
            'company',
            'taken',
            'taken',
        ]);
        expect(entries[0]).toMatchObject({
            linkEntityTypeId: BitrixOwnerTypeId.COMPANY,
            linkEntityId: 500,
        });
        expect(itemUpdate).toHaveBeenCalledTimes(1);
        expect(itemUpdate).toHaveBeenCalledWith(
            'lc_link_1',
            500,
            BitrixOwnerTypeId.COMPANY,
            { leadId: 1 },
        );
    });

    it('откат связи через компанию — «Лид» компании обратно в 0', () => {
        const { writer, itemUpdate } = setup();
        const entries = writer.queue([
            item({
                leadId: 1,
                linkDealLeadId: 77,
                linkCompany: { id: 500, leadId: 0 },
            }),
        ]);
        itemUpdate.mockClear();
        writer.queueRollback(entries);
        expect(itemUpdate).toHaveBeenCalledWith(
            'lc_link_1_rb',
            500,
            BitrixOwnerTypeId.COMPANY,
            { leadId: 0 },
        );
    });
    it('работа в другом отделе: сделки связи нет — «Лид» компании и компания лиду', () => {
        const { writer, leadUpdate, itemUpdate } = setup();
        const [entry] = writer.queue([
            item({
                leadId: 7,
                linkDealId: null,
                linkCompany: { id: 66637, leadId: 0 },
                decision: {
                    target: 'lead_converted',
                    linkDealId: null,
                    reason: 'apology_work_elsewhere',
                },
                lead: {
                    id: 7,
                    statusId: 'PBX_TAKEN_IN_WORK',
                    companyId: 0,
                    contactId: 0,
                    dealId: 10,
                },
            }),
        ]);

        expect(entry).toMatchObject({
            linkAction: 'company',
            leadCompanySet: 66637,
        });
        expect(leadUpdate).toHaveBeenCalledWith('lc_lead_7', 7, {
            STATUS_ID: 'CONVERTED',
            COMPANY_ID: '66637',
        });
        expect(itemUpdate).toHaveBeenCalledWith(
            'lc_link_7',
            66637,
            BitrixOwnerTypeId.COMPANY,
            { leadId: 7 },
        );

        leadUpdate.mockClear();
        writer.queueRollback([entry]);
        expect(leadUpdate).toHaveBeenCalledWith('lc_lead_7_rb', 7, {
            STATUS_ID: 'PBX_TAKEN_IN_WORK',
            COMPANY_ID: '0',
        });
    });

    it('брак лиду компанию не проставляет', () => {
        const { writer, leadUpdate } = setup();
        writer.queue([
            item({
                leadId: 8,
                linkCompany: { id: 500, leadId: 0 },
                decision: {
                    target: 'lead_junk',
                    linkDealId: 10,
                    reason: 'deal_not_ca',
                },
                lead: {
                    id: 8,
                    statusId: 'PBX_TAKEN_IN_WORK',
                    companyId: 0,
                    contactId: 0,
                    dealId: 10,
                },
            }),
        ]);

        expect(leadUpdate).toHaveBeenCalledWith('lc_lead_8', 8, {
            STATUS_ID: '2',
        });
    });
});
