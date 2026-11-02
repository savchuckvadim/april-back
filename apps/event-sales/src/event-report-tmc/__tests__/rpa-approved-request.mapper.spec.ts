import { ETimeZone } from '@lib/shared/lib/date';
import {
    joinRpaMultiText,
    mapApprovedRpaItem,
    parseRpaCrmBinding,
    RpaFieldResolver,
    RpaItemRow,
} from '../lib/rpa-approved-request.mapper';
import { RPA_PRESENTATION_FIELD } from '../lib/rpa-presentation-fields.const';

/**
 * Элемент РПА «Заявка на презентацию» в стадии «Утверждено» → параметры
 * согласования, которые шлёт робот. Эталон — реальная утверждённая заявка
 * gsr (элемент 1195, снято 02.11.2026 только чтением).
 */
const DOMAIN = 'gsr.bitrix24.ru';
const uf = (code: string): string => `UF_RPA_7_${code.toUpperCase()}`;
const resolve: RpaFieldResolver = code => uf(code);

const approvedItem: RpaItemRow = {
    id: 1195,
    stageId: 35,
    name: 'Заявка перезвонить Виктория от 31.08.2026 11:30:07',
    createdTime: '31.08.2026 11:30:13',
    movedTime: '31.08.2026 15:53:29',
    movedBy: 39,
    createdBy: 187,
    UF_RPA_7_NAME: 'Заявка перезвонить Виктория от 31.08.2026 11:30:07',
    UF_RPA_7_NEXT_PRES_PLAN_DATE: '2026-08-31T15:00:00+03:00',
    UF_RPA_7_LAST_PRES_DONE_RESPONSIBLE: 323,
    UF_RPA_7_LAST_PRES_PLAN_RESPONSIBLE: 215,
    UF_RPA_7_OWNER_OP: 1,
    UF_RPA_7_RPA_CRM_COMPANY: 74649,
    UF_RPA_7_RPA_CRM_CONTACT: 48223,
    UF_RPA_7_RPA_CRM_TMC_DEAL: 198467,
    UF_RPA_7_RPA_OWNER_COMMENT: ['ок'],
    UF_RPA_7_RPA_TMC_COMMENT: [
        'об Искре не слышала, спортивная школа, имеется другая спс',
    ],
    UF_RPA_7_RPA_MANAGER_COMMENT: ['ок'],
};

const map = (over: RpaItemRow = {}, resolver: RpaFieldResolver = resolve) =>
    mapApprovedRpaItem(
        { ...approvedItem, ...over },
        DOMAIN,
        resolver,
        ETimeZone.EUROPE_MOSCOW,
    );

describe('mapApprovedRpaItem', () => {
    it('утверждённая заявка → параметры робота: даты в CRM-формате локали портала', () => {
        const mapped = map();

        expect(mapped.ok).toBe(true);
        if (!mapped.ok) return;
        expect(mapped.request.dto).toEqual({
            domain: DOMAIN,
            tmcDealId: 198467,
            companyId: 74649,
            contactId: 48223,
            ownerId: '1',
            managerId: '323',
            tmcId: '215',
            deadline: '31.08.2026 15:00:00',
            name: 'Заявка перезвонить Виктория от 31.08.2026 11:30:07',
            commentOwner: 'ок',
            commentTMC:
                'об Искре не слышала, спортивная школа, имеется другая спс',
            commentManager: 'ок',
        });
        expect(mapped.request).toMatchObject({
            rpaItemId: 1195,
            movedBy: 39,
            tmcDealId: 198467,
            managerId: 323,
        });
        expect(mapped.request.movedAt?.toCrmDateTime()).toBe(
            '31.08.2026 15:53:29',
        );
        expect(mapped.request.deadline.toCrmDateTime()).toBe(
            '31.08.2026 15:00:00',
        );
    });

    it('crm-привязки с префиксом и массивом читаются так же, как сырые id; пустой контакт не передаётся', () => {
        const mapped = map({
            UF_RPA_7_RPA_CRM_TMC_DEAL: 'D_198467',
            UF_RPA_7_RPA_CRM_COMPANY: ['CO_74649'],
            UF_RPA_7_RPA_CRM_CONTACT: null,
            UF_RPA_7_RPA_OWNER_COMMENT: [],
        });

        expect(mapped.ok).toBe(true);
        if (!mapped.ok) return;
        expect(mapped.request.dto).toMatchObject({
            tmcDealId: 198467,
            companyId: 74649,
        });
        expect(mapped.request.dto.contactId).toBeUndefined();
        expect(mapped.request.dto.commentOwner).toBeUndefined();
    });

    it('руководитель: поле «Руководитель» → утвердивший заявку → сам менеджер', () => {
        const byMover = map({ UF_RPA_7_OWNER_OP: 0 });
        expect(byMover.ok && byMover.request.dto.ownerId).toBe('39');

        const byManager = map({ UF_RPA_7_OWNER_OP: 0, movedBy: 0 });
        expect(byManager.ok && byManager.request.dto.ownerId).toBe('323');

        const noTmc = map({ UF_RPA_7_LAST_PRES_PLAN_RESPONSIBLE: 0 });
        expect(noTmc.ok && noTmc.request.dto.tmcId).toBeUndefined();
    });

    it('без менеджера, даты, компании или ТМЦ-сделки заявку провести нельзя — причина называет поля', () => {
        const noManager = map({ UF_RPA_7_LAST_PRES_DONE_RESPONSIBLE: 0 });
        expect(noManager).toEqual({
            ok: false,
            rpaItemId: 1195,
            reason: expect.stringContaining('менеджер ОП') as string,
        });

        const noDate = map({ UF_RPA_7_NEXT_PRES_PLAN_DATE: '' });
        expect(!noDate.ok && noDate.reason).toContain('дата презентации');

        const noLinks = map({
            UF_RPA_7_RPA_CRM_COMPANY: null,
            UF_RPA_7_RPA_CRM_TMC_DEAL: 'мусор',
        });
        expect(!noLinks.ok && noLinks.reason).toBe(
            'не заполнено: ТМЦ-сделка, компания',
        );
    });

    it('поле не установлено на портале (слепок не знает UF) — равно незаполненному', () => {
        const withoutManagerField: RpaFieldResolver = code =>
            code === RPA_PRESENTATION_FIELD.lastPresDoneResponsible
                ? undefined
                : uf(code);

        const mapped = map({}, withoutManagerField);

        expect(mapped.ok).toBe(false);
    });
});

describe('parseRpaCrmBinding / joinRpaMultiText', () => {
    it('привязка: число, строка, префикс сущности, массив; мусор — 0', () => {
        expect(parseRpaCrmBinding(213065)).toBe(213065);
        expect(parseRpaCrmBinding('213065')).toBe(213065);
        expect(parseRpaCrmBinding('CO_95857')).toBe(95857);
        expect(parseRpaCrmBinding(['D_5'])).toBe(5);
        expect(parseRpaCrmBinding('abc')).toBe(0);
        expect(parseRpaCrmBinding(null)).toBe(0);
        expect(parseRpaCrmBinding([])).toBe(0);
    });

    it('множественный текст: непустые строки через перевод строки', () => {
        expect(joinRpaMultiText(['а ', '  ', 'б'])).toBe('а\nб');
        expect(joinRpaMultiText('одна')).toBe('одна');
        expect(joinRpaMultiText(null)).toBe('');
        expect(joinRpaMultiText([42])).toBe('');
    });
});
