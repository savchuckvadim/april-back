import {
    CallReportFamilyCache,
    FAMILY_CACHE_TTL_MS,
    familyCacheKey,
} from '../services/call-report-family-cache';

describe('CallReportFamilyCache', () => {
    const START = 1_700_000_000_000;

    it('ответ переиспользуется в пределах окна', () => {
        const cache = new CallReportFamilyCache<{ mainDealId: number }>();
        cache.set('k', { mainDealId: 10 }, START);

        expect(cache.get('k', START + 1)).toEqual({ mainDealId: 10 });
        expect(cache.get('k', START + FAMILY_CACHE_TTL_MS - 1)).toEqual({
            mainDealId: 10,
        });
    });

    it('после окна ответа нет — связи в CRM могли измениться', () => {
        const cache = new CallReportFamilyCache<number>();
        cache.set('k', 1, START);

        expect(cache.get('k', START + FAMILY_CACHE_TTL_MS)).toBeUndefined();
        expect(cache.size()).toBe(0);
    });

    it('окно по умолчанию — минута, оно настраивается', () => {
        expect(FAMILY_CACHE_TTL_MS).toBe(60_000);

        const cache = new CallReportFamilyCache<number>(1000);
        cache.set('k', 1, START);
        expect(cache.get('k', START + 999)).toBe(1);
        expect(cache.get('k', START + 1000)).toBeUndefined();
    });

    it('протухшие ключи вычищаются, счётчик не растёт бесконечно', () => {
        const cache = new CallReportFamilyCache<number>(1000);
        for (let i = 0; i < 50; i += 1) cache.set(`key-${i}`, i, START);
        expect(cache.size()).toBe(50);

        cache.set('fresh', 1, START + 5000);
        expect(cache.size()).toBe(1);
    });

    it('clear забывает всё', () => {
        const cache = new CallReportFamilyCache<number>();
        cache.set('k', 1, START);
        cache.clear();
        expect(cache.get('k', START + 1)).toBeUndefined();
    });
});

describe('familyCacheKey', () => {
    const base = {
        domain: 'a.bitrix24.ru',
        dealId: 175244,
        companyId: 232232,
        callStartedAt: new Date('2026-09-08T10:15:00.000Z'),
    };

    it('одни и те же входы дают один ключ', () => {
        expect(familyCacheKey(base)).toBe(familyCacheKey({ ...base }));
    });

    it('разные порталы не делят запись', () => {
        expect(familyCacheKey(base)).not.toBe(
            familyCacheKey({ ...base, domain: 'b.bitrix24.ru' }),
        );
    });

    it.each([
        ['сделка', { dealId: 999 }],
        ['лид', { leadId: 5 }],
        ['компания', { companyId: 1 }],
        ['контакт', { contactId: 1 }],
        [
            'время звонка',
            { callStartedAt: new Date('2026-09-08T11:00:00.000Z') },
        ],
        ['номер звонящего', { callerId: '+79990000000' }],
        ['тип звонка', { callType: 'cold' }],
    ])('разный %s — разный ключ', (_label, patch) => {
        expect(familyCacheKey({ ...base, ...patch })).not.toBe(
            familyCacheKey(base),
        );
    });

    it('дата как строка и как объект дают один ключ', () => {
        expect(
            familyCacheKey({
                ...base,
                callStartedAt: base.callStartedAt.toISOString(),
            }),
        ).toBe(familyCacheKey(base));
    });

    it('пустые поля не склеивают разные входы', () => {
        // Без разделителя «лид 1 + компании нет» и «лида нет + компания 1»
        // дали бы одну строку.
        const asLead = familyCacheKey({ domain: 'a', leadId: 1 });
        const asCompany = familyCacheKey({ domain: 'a', companyId: 1 });
        expect(asLead).not.toBe(asCompany);
    });
});
