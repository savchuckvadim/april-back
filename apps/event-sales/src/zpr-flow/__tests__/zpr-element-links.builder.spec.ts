import { ZprElementLinksBuilder } from '../services/zpr-element-links.builder';
import { BxRow } from '../types/zpr-flow-run.type';
import { makeRun } from './zpr-flow.fixtures';

/**
 * ТРИ контура связи элемента ЗПР с клиентом: наши crm-поля (поиск из кода),
 * системные родители (вкладка/фильтр карточки) и системный «Клиент»
 * (телефония/письма). Инцидент 31.08: первый контур не сохранялся из-за
 * формата, третий не заполнялся вовсе.
 */
describe('ZprElementLinksBuilder', () => {
    it('crm-связи одиночных однотипных полей — голым числовым id', () => {
        const links = new ZprElementLinksBuilder(makeRun());
        const fields: BxRow = {};

        links.applyLinks(fields);

        expect(fields.ufCrm7BaseDeal).toBe(100);
        expect(fields.ufCrm7PresDeal).toBe(77);
        expect(fields.ufCrm7Company).toBe(431);
        expect(fields.ufCrm7Lead).toBe(42);
        expect(fields.ufCrm7Contact).toBe(9);
    });

    it('отсутствующие сущности не пишутся вовсе', () => {
        const links = new ZprElementLinksBuilder(
            makeRun({
                job: {
                    baseDealId: null,
                    presDealId: null,
                    companyId: null,
                    leadId: null,
                    contactId: null,
                },
            }),
        );
        const fields: BxRow = {};

        links.applyLinks(fields);
        links.applyParents(fields);
        links.applyClient(fields);

        expect(fields).toEqual({});
    });

    it('элемент получает системных РОДИТЕЛЕЙ (вкладка и фильтр в карточке)', () => {
        const links = new ZprElementLinksBuilder(makeRun());
        const fields: BxRow = {};

        links.applyParents(fields);

        // parentId{entityTypeId}: 2 — сделка, 4 — компания, 1 — лид, 3 — контакт.
        expect(fields.parentId2).toBe(100);
        expect(fields.parentId4).toBe(431);
        expect(fields.parentId1).toBe(42);
        expect(fields.parentId3).toBe(9);
    });

    it('системный «Клиент» — companyId и contactIds (не родитель!)', () => {
        const links = new ZprElementLinksBuilder(makeRun());
        const fields: BxRow = {};

        links.applyClient(fields);

        expect(fields.companyId).toBe(431);
        // contactIds — множественное поле даже при одном контакте.
        expect(fields.contactIds).toEqual([9]);
    });
});
