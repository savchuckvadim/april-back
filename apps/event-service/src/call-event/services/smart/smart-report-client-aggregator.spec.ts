import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { EnumOrkFieldCode } from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import { OrkFieldResolver } from '../ork/ork-field.resolver';
import {
    SmartReportClientAggregator,
    createEmptyClientFields,
} from './smart-report-client-aggregator';

const list = {
    group: 'service',
    type: 'ork_history',
    bitrixId: 93,
    bitrixfields: [
        {
            code: EnumOrkFieldCode.ork_event_action,
            bitrixCamelId: 'PROPERTY_ACTION',
            items: [
                { code: 'ea_ork_done', bitrixId: 100 },
                { code: 'ea_ork_plan', bitrixId: 101 },
            ],
        },
        {
            code: EnumOrkFieldCode.ork_event_type,
            bitrixCamelId: 'PROPERTY_TYPE',
            items: [
                { code: 'et_ork_edu', bitrixId: 200 },
                { code: 'et_ork_presentation', bitrixId: 201 },
                { code: 'et_ork_signal', bitrixId: 202 },
                { code: 'et_ork_edu_first', bitrixId: 203 },
            ],
        },
        {
            code: EnumOrkFieldCode.event_communication,
            bitrixCamelId: 'PROPERTY_COMM',
            items: [
                { code: 'ec_ork_call', bitrixId: 300 },
                { code: 'ec_ork_face', bitrixId: 301 },
            ],
        },
        {
            code: EnumOrkFieldCode.ork_event_initiative,
            bitrixCamelId: 'PROPERTY_INIT',
            items: [
                { code: 'ei_ork_incoming', bitrixId: 400 },
                { code: 'ei_ork_outgoing', bitrixId: 401 },
            ],
        },
        {
            code: EnumOrkFieldCode.responsible,
            bitrixCamelId: 'PROPERTY_RESP',
            items: [],
        },
        {
            code: EnumOrkFieldCode.ork_event_date,
            bitrixCamelId: 'PROPERTY_DATE',
            items: [],
        },
        {
            code: EnumOrkFieldCode.ork_plan_date,
            bitrixCamelId: 'PROPERTY_PLAN',
            items: [],
        },
        {
            code: EnumOrkFieldCode.ork_crm_contact,
            bitrixCamelId: 'PROPERTY_CONTACT',
            items: [],
        },
        {
            code: EnumOrkFieldCode.ork_crm_company,
            bitrixCamelId: 'PROPERTY_COMPANY',
            items: [],
        },
    ],
} as unknown as IPBXList;

describe('SmartReportClientAggregator', () => {
    const aggregator = new SmartReportClientAggregator(
        new OrkFieldResolver(list),
    );

    it('агрегирует состоявшееся обучение по контакту', () => {
        const client = aggregator.aggregateElement({
            PROPERTY_ACTION: '100',
            PROPERTY_TYPE: '200',
            PROPERTY_COMM: '300',
            PROPERTY_INIT: '400',
            PROPERTY_RESP: '187',
            PROPERTY_DATE: '01.06.2026 10:00:00',
            PROPERTY_CONTACT: '555',
        });

        expect(client.bxId).toBe(555);
        expect(client.fields.countCommunicationFact).toBe(1);
        expect(client.fields.countEdu).toBe(1);
        expect(client.fields.countCall).toBe(1);
        expect(client.fields.countCommunicationIncoming).toBe(1);
        expect(client.fields.dateLastEdu).toBe('01.06.2026 10:00:00');
        expect(client.fields.responsibleEdu).toEqual(['187']);
    });

    it('запланированный сервисный сигнал увеличивает countSignal', () => {
        const client = aggregator.aggregateElement({
            PROPERTY_ACTION: '101',
            PROPERTY_TYPE: '202',
            PROPERTY_COMPANY: 'CO_79753',
        });
        expect(client.bxId).toBe(79753);
        expect(client.fields.countSignal).toBe(1);
        expect(client.fields.countCommunicationFact).toBe(0);
    });

    it('суммирует поля контактов в компанию', () => {
        const company = { bxId: 1, fields: createEmptyClientFields() };
        const contact = { bxId: 2, fields: createEmptyClientFields() };
        contact.fields.countPresentation = 2;
        contact.fields.responsiblePresentation = ['10'];
        aggregator.mergeContactsIntoCompany(company, [contact]);
        expect(company.fields.countPresentation).toBe(2);
        expect(company.fields.responsiblePresentation).toEqual(['10']);
    });
});
