import { coldTaskBindings } from '../services/enities/task/cold-task-bindings';

/**
 * garant 14.10.2026, задача #776877: в задаче ХО была ХО-сделка из воронки
 * «ОП Холодные», куда у менеджеров нет прав. Её перенесли в «ОП Основная»
 * и отработали копию, а настоящая основная осталась без задачи.
 */
describe('coldTaskBindings', () => {
    it('компания: компания и основная, без ХО-сделки', () => {
        expect(
            coldTaskBindings(
                { kind: 'company', companyId: 167441 },
                '32995',
                '98417',
            ),
        ).toEqual(['CO_167441', 'D_32995']);
    });

    it('новая основная того же батча — ссылка-токен $result', () => {
        expect(
            coldTaskBindings(
                { kind: 'company', companyId: 5 },
                '$result[new_base_deal_5]',
                '$result[new_cold_deal_5]',
            ),
        ).toEqual(['CO_5', 'D_$result[new_base_deal_5]']);
    });

    it('клиент без компании: основная и лид входной сделки', () => {
        expect(
            coldTaskBindings(
                {
                    kind: 'deal',
                    entryDealId: 32995,
                    contactId: 7,
                    leadId: 214339,
                },
                '32995',
                '98417',
            ),
        ).toEqual(['D_32995', 'L_214339']);
    });

    it('основной нет («Холодные» не сопоставлена) — задача на ХО-сделке', () => {
        expect(
            coldTaskBindings(
                { kind: 'company', companyId: 5 },
                null,
                '$result[new_cold_deal_5]',
            ),
        ).toEqual(['CO_5', 'D_$result[new_cold_deal_5]']);
    });

    it('клиент без компании и без лида — только сделка', () => {
        expect(
            coldTaskBindings(
                { kind: 'deal', entryDealId: 1, contactId: null, leadId: null },
                '1',
                '2',
            ),
        ).toEqual(['D_1']);
    });
});
