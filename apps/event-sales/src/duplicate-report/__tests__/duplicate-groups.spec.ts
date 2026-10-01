import {
    buildClientInputs,
    clientKey,
    excludeOwners,
    groupDealsByClient,
    responsibleIds,
} from '../lib/duplicate-groups';
import { DuplicateContext } from '../types/duplicate-report.types';
import { makeDeal, makeLead, NOW } from './fixtures/duplicate-report.fixture';

const EMPTY_CONTEXT: DuplicateContext = {
    clientTitles: new Map(),
    clientInns: new Map(),
    leads: new Map(),
    openTasks: new Map(),
};

describe('группировка сделок по клиенту', () => {
    it('по компании, без компании — по контакту; клиент с одной сделкой отбрасывается', () => {
        const groups = groupDealsByClient([
            makeDeal(1, { companyId: 100 }),
            makeDeal(2, { companyId: 100 }),
            makeDeal(3, { companyId: null, contactId: 7 }),
            makeDeal(4, { companyId: null, contactId: 7 }),
            makeDeal(5, { companyId: 200 }),
        ]);
        expect(
            groups.map(group => [
                clientKey(group.client),
                group.deals.map(deal => deal.id),
            ]),
        ).toEqual([
            ['company:100', [1, 2]],
            ['contact:7', [3, 4]],
        ]);
    });

    it('сделка без компании с контактом из сделки компании — к этой компании', () => {
        const groups = groupDealsByClient([
            makeDeal(1, { companyId: 100, contactId: 7 }),
            makeDeal(2, { companyId: null, contactId: 7 }),
        ]);
        expect(
            groups.map(group => [
                clientKey(group.client),
                group.deals.map(deal => deal.id),
            ]),
        ).toEqual([['company:100', [1, 2]]]);
    });

    it('контакт в сделках двух компаний — неоднозначно, сделка остаётся у контакта', () => {
        const groups = groupDealsByClient([
            makeDeal(1, { companyId: 100, contactId: 7 }),
            makeDeal(2, { companyId: 200, contactId: 7 }),
            makeDeal(3, { companyId: null, contactId: 7 }),
            makeDeal(4, { companyId: null, contactId: 7 }),
        ]);
        expect(groups.map(group => clientKey(group.client))).toEqual([
            'contact:7',
        ]);
    });

    it('сделка без компании и контакта в отчёт не попадает', () => {
        expect(
            groupDealsByClient([
                makeDeal(1, { companyId: null }),
                makeDeal(2, { companyId: null }),
            ]),
        ).toEqual([]);
    });

    it('исключённые сотрудники: их сделки убираются, клиент с одной оставшейся выпадает', () => {
        const groups = groupDealsByClient([
            makeDeal(1, { companyId: 100, assignedById: 11 }),
            makeDeal(2, { companyId: 100, assignedById: 500 }),
            makeDeal(3, { companyId: 200, assignedById: 11 }),
            makeDeal(4, { companyId: 200, assignedById: 12 }),
            makeDeal(5, { companyId: 200, assignedById: 500 }),
        ]);
        const kept = excludeOwners(groups, [500]);
        expect(kept.map(group => clientKey(group.client))).toEqual([
            'company:200',
        ]);
        expect(kept[0].deals.map(deal => deal.id)).toEqual([3, 4]);
        expect(excludeOwners(groups, [])).toHaveLength(2);
    });

    it('ответственные групп — без повторов и пустых', () => {
        const groups = groupDealsByClient([
            makeDeal(1, { assignedById: 11 }),
            makeDeal(2, { assignedById: 11 }),
            makeDeal(3, { assignedById: null }),
        ]);
        expect(responsibleIds(groups)).toEqual([11]);
    });

    it('вход разбора: лид и задачи подставлены, без подписи — запасное название и ИНН сделок', () => {
        const [group] = groupDealsByClient([
            makeDeal(1, { sourceLeadId: 7, inn: '3666000002' }),
            makeDeal(2, { inn: '3666000001' }),
        ]);
        const lead = makeLead(7, NOW);
        const [input] = buildClientInputs([group], {
            ...EMPTY_CONTEXT,
            leads: new Map([[7, lead]]),
            openTasks: new Map([
                [
                    2,
                    [
                        { id: 70, responsibleId: 11 },
                        { id: 71, responsibleId: 12 },
                        { id: 72, responsibleId: null },
                    ],
                ],
            ]),
        });
        expect(input.title).toBe('Компания 100');
        expect(input.inn).toBe('3666000001, 3666000002');
        expect(input.deals[0].lead).toBe(lead);
        expect(input.deals[1].openTasks).toBe(3);
        // Своя — только задача ответственного сделки (11).
        expect(input.deals[1].ownOpenTasks).toBe(1);
        expect(input.deals[1].openTaskIds).toEqual([70, 71, 72]);
    });

    it('вход разбора: подпись и ИНН компании из второго прохода', () => {
        const [group] = groupDealsByClient([makeDeal(1), makeDeal(2)]);
        const [input] = buildClientInputs([group], {
            ...EMPTY_CONTEXT,
            clientTitles: new Map([['company:100', 'ООО «Ромашка»']]),
            clientInns: new Map([['company:100', '3666000000']]),
        });
        expect(input.title).toBe('ООО «Ромашка»');
        expect(input.inn).toBe('3666000000');
    });
});
