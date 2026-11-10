import { IBXCompany, IBXDeal } from '@/modules/bitrix';
import { XO_START_BASE_DEAL_TITLE_MODE } from '@lib/portal-lib/store/app-settings';
import {
    buildColdNewDealClient,
    coldNewDealContactFields,
} from '../lib/cold-new-deal-client';
import { ColdOwner } from '../services/enities/cold-owner.type';
import { ColdTarget } from '../services/target/cold-target.types';

const target = (patch: Partial<ColdTarget>): ColdTarget =>
    ({
        hookKey: 'h1',
        hook: {},
        kind: 'company',
        company: null,
        companyId: null,
        entryDeal: null,
        rootDealId: null,
        ...patch,
    }) as ColdTarget;

const company = (title: string): IBXCompany =>
    ({ ID: '7', TITLE: title }) as unknown as IBXCompany;
const deal = (id: string, title: string): IBXDeal =>
    ({ ID: id, TITLE: title }) as unknown as IBXDeal;

const { client, default: byBitrix } = XO_START_BASE_DEAL_TITLE_MODE;

describe('buildColdNewDealClient — название новой основной', () => {
    it('режим по умолчанию — названия нет, сделку назовёт Битрикс', () => {
        const result = buildColdNewDealClient(
            target({ company: company('ООО Ромашка'), companyId: 7 }),
            [],
            byBitrix,
        );
        expect(result.baseDealTitle).toBeNull();
    });

    it('неизвестное значение настройки ведёт себя как режим по умолчанию', () => {
        const result = buildColdNewDealClient(
            target({ company: company('ООО Ромашка'), companyId: 7 }),
            [],
            'что-то новое',
        );
        expect(result.baseDealTitle).toBeNull();
    });

    it('«по названию клиента» — название компании', () => {
        const result = buildColdNewDealClient(
            target({ company: company('  ООО Ромашка '), companyId: 7 }),
            [],
            client,
        );
        expect(result.baseDealTitle).toBe('ООО Ромашка');
    });

    it.each(['', 'Сделка #116949', '4826132470', 'Холодный обзвон'])(
        'заглушка «%s» вместо названия компании — названия нет',
        title => {
            const result = buildColdNewDealClient(
                target({ company: company(title), companyId: 7 }),
                [],
                client,
            );
            expect(result.baseDealTitle).toBeNull();
        },
    );

    it('клиент без компании: название основной сделки, из которой запустили', () => {
        const result = buildColdNewDealClient(
            target({
                kind: 'deal',
                entryDeal: deal('500', 'Иванов Иван'),
                rootDealId: 500,
            }),
            [],
            client,
        );
        expect(result.baseDealTitle).toBe('Иванов Иван');
    });

    it('клиент без компании: название сделки ХО или презентации клиентом не считается', () => {
        const result = buildColdNewDealClient(
            target({
                kind: 'deal',
                entryDeal: deal('510', 'Презентация ДЕМО'),
                rootDealId: 500,
            }),
            [],
            client,
        );
        expect(result.baseDealTitle).toBeNull();
    });

    it('знак # в названии уезжает в пачку целиком (инцидент gsr 09.11.2026)', () => {
        const result = buildColdNewDealClient(
            target({ company: company('ООО №1 #2'), companyId: 7 }),
            [],
            client,
        );
        expect(result.baseDealTitle).not.toBeNull();
        expect(result.baseDealTitle).toContain('ООО');
    });
});

describe('buildColdNewDealClient — контакты', () => {
    it('дубли и мусор отбрасываются, порядок сохраняется', () => {
        const result = buildColdNewDealClient(
            target({}),
            [92, 91, 92, 0, -1, Number.NaN],
            byBitrix,
        );
        expect(result.contactIds).toEqual([92, 91]);
    });
});

describe('coldNewDealContactFields', () => {
    const companyOwner: ColdOwner = { kind: 'company', companyId: 7 };

    it('компания: первый контакт — основной, все — в привязки', () => {
        expect(coldNewDealContactFields(companyOwner, [91, 92])).toEqual({
            CONTACT_ID: '91',
            CONTACT_IDS: [91, 92],
        });
    });

    it('контактов нет — полей нет (пустой CONTACT_IDS в пачку не уезжает)', () => {
        expect(coldNewDealContactFields(companyOwner, [])).toEqual({});
    });

    it('клиент без компании: контакт входной сделки остаётся основным', () => {
        const owner: ColdOwner = {
            kind: 'deal',
            entryDealId: 600,
            contactId: 9,
            leadId: 12,
        };
        expect(coldNewDealContactFields(owner, [55, 9])).toEqual({
            CONTACT_ID: '9',
            CONTACT_IDS: [9, 55],
        });
    });

    it('клиент без компании и без контакта входной сделки — берутся контакты клиента', () => {
        const owner: ColdOwner = {
            kind: 'deal',
            entryDealId: 600,
            contactId: null,
            leadId: null,
        };
        expect(coldNewDealContactFields(owner, [55])).toEqual({
            CONTACT_ID: '55',
            CONTACT_IDS: [55],
        });
    });
});
