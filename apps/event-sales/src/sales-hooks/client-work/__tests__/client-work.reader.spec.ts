import { clientGroupsOf } from '../../../duplicate-report/lib/duplicate-groups';
import { makeDeal } from '../../../duplicate-report/__tests__/fixtures/duplicate-report.fixture';
import { pickClientGroup } from '../services/client-work.reader';

const ids = (group: ReturnType<typeof pickClientGroup>) =>
    group?.deals.map(deal => deal.id) ?? null;

describe('«Работа клиента»: группа клиента сделки', () => {
    const groups = clientGroupsOf([
        makeDeal(1, { companyId: 100, contactId: 7 }),
        makeDeal(2, { companyId: 100 }),
        // Без компании, контакт 7 — тот же человек, что в сделке компании 100.
        makeDeal(3, { companyId: null, contactId: 7 }),
        makeDeal(4, { companyId: 200 }),
        makeDeal(5, { companyId: null, contactId: 9 }),
    ]);

    it('у сделки есть компания — все открытые сделки компании и её контакта', () => {
        expect(
            ids(pickClientGroup(groups, { companyId: 100, contactId: 7 })),
        ).toEqual([1, 2, 3]);
    });

    it('без компании, контакт отнесён к компании — группа этой компании', () => {
        expect(
            ids(pickClientGroup(groups, { companyId: null, contactId: 7 })),
        ).toEqual([1, 2, 3]);
    });

    it('без компании — группа контакта, даже из одной сделки', () => {
        expect(
            ids(pickClientGroup(groups, { companyId: null, contactId: 9 })),
        ).toEqual([5]);
    });

    it('ни компании, ни контакта — клиента нет', () => {
        expect(
            pickClientGroup(groups, { companyId: null, contactId: null }),
        ).toBeNull();
    });

    it('у компании нет открытых сделок — клиента нет (присоединять нечего)', () => {
        expect(
            pickClientGroup(groups, { companyId: 300, contactId: null }),
        ).toBeNull();
    });
});
