import {
    MAX_DEAL_CONTACT_LINKS,
    queueDealContactLinks,
} from '../services/flows/deal-contact-links';

/** Буфер-шпион: enqueue выполняется сразу — команды видны в моке. */
const setup = () => {
    const contactAdd = jest.fn<
        void,
        [string, number, { CONTACT_ID: number }]
    >();
    const buffer = { queue: jest.fn((enqueue: () => void) => enqueue()) };
    const bitrix = { batch: { deal: { contactAdd } } };
    return { contactAdd, buffer, bitrix };
};

describe('queueDealContactLinks', () => {
    it('по команде crm.deal.contact.add на контакт, через буфер вызывающего', () => {
        const { contactAdd, buffer, bitrix } = setup();

        const linked = queueDealContactLinks(bitrix as never, buffer, {
            dealId: 42423,
            contactIds: [288609, 282699],
            cmdPrefix: 'lw_deal_join_42_ct',
        });

        expect(linked).toEqual([288609, 282699]);
        expect(buffer.queue).toHaveBeenCalledTimes(2);
        expect(contactAdd.mock.calls).toEqual([
            ['lw_deal_join_42_ct_288609', 42423, { CONTACT_ID: 288609 }],
            ['lw_deal_join_42_ct_282699', 42423, { CONTACT_ID: 282699 }],
        ]);
    });

    it('повторы и мусорные id отсеиваются', () => {
        const { contactAdd, buffer, bitrix } = setup();

        queueDealContactLinks(bitrix as never, buffer, {
            dealId: 1,
            contactIds: [5, 5, 0, -3, Number.NaN, 7],
            cmdPrefix: 'p',
        });

        expect(contactAdd.mock.calls.map(call => call[2])).toEqual([
            { CONTACT_ID: 5 },
            { CONTACT_ID: 7 },
        ]);
    });

    it('контактов больше лимита — привязываются первые: группа лида должна влезть в один batch', () => {
        const { contactAdd, buffer, bitrix } = setup();
        const many = Array.from({ length: 12 }, (_, index) => index + 1);

        const linked = queueDealContactLinks(bitrix as never, buffer, {
            dealId: 1,
            contactIds: many,
            cmdPrefix: 'p',
        });

        expect(linked).toEqual(many.slice(0, MAX_DEAL_CONTACT_LINKS));
        expect(contactAdd).toHaveBeenCalledTimes(MAX_DEAL_CONTACT_LINKS);
    });

    it('контактов нет — ни одной команды', () => {
        const { contactAdd, buffer, bitrix } = setup();
        queueDealContactLinks(bitrix as never, buffer, {
            dealId: 1,
            contactIds: [],
            cmdPrefix: 'p',
        });
        expect(buffer.queue).not.toHaveBeenCalled();
        expect(contactAdd).not.toHaveBeenCalled();
    });
});
