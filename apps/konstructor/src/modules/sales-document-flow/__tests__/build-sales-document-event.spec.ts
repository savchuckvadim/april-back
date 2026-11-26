import {
    buildSalesDocumentEvent,
    SalesDocumentEventInput,
} from '../lib/build-sales-document-event';
import { offerSource, priceRow } from './sales-document.fixtures';

const CREATED_AT = new Date('2026-11-26T09:30:00.000Z');

/** Общие поля запроса: домен, пользователь, компания и основная сделка. */
const base = (
    over: Partial<SalesDocumentEventInput> = {},
): SalesDocumentEventInput => ({
    eventId: 'op-1',
    domain: 'garant.bitrix24.ru',
    userId: 6,
    companyId: '32442',
    dealId: '35018',
    kinds: ['offer'],
    createdAt: CREATED_AT,
    sources: [
        offerSource({
            name: 'Гарант-Максимум',
            supply: 'Интернет 5 ОД',
            list: 1200,
            current: 1000,
            quantity: 12,
            measureCode: 15,
        }),
    ],
    ...over,
});

describe('buildSalesDocumentEvent: виды документов', () => {
    it('КП без счёта: вид offer, сумма и текст', () => {
        const event = buildSalesDocumentEvent(base());

        expect(event).toEqual({
            eventId: 'op-1',
            domain: 'garant.bitrix24.ru',
            userId: 6,
            companyId: 32442,
            dealId: 35018,
            kinds: ['offer'],
            createdAt: '2026-11-26T09:30:00.000Z',
            sum: 12000,
            summary: 'КП: Гарант-Максимум, Интернет 5 ОД, 12 000 ₽',
        });
    });

    it('КП со счётом: два вида в одном событии, порядок контракта', () => {
        const event = buildSalesDocumentEvent(
            base({ kinds: ['invoice', 'offer'] }),
        );

        expect(event?.kinds).toEqual(['offer', 'invoice']);
        expect(event?.summary).toMatch(/^КП: /);
    });

    it('повторы видов схлопываются', () => {
        const event = buildSalesDocumentEvent(
            base({ kinds: ['offer', 'offer', 'invoice'] }),
        );

        expect(event?.kinds).toEqual(['offer', 'invoice']);
    });

    it('договор: вид contract, текст «Договор: …», без товарных строк', () => {
        const event = buildSalesDocumentEvent(base({ kinds: ['contract'] }));

        expect(event?.kinds).toEqual(['contract']);
        expect(event?.summary).toBe(
            'Договор: Гарант-Максимум, Интернет 5 ОД, 12 000 ₽',
        );
        expect(event).not.toHaveProperty('productRows');
        expect(event).not.toHaveProperty('presentation');
    });

    it('поставка: вид supply, текст «Поставка: …»', () => {
        const event = buildSalesDocumentEvent(base({ kinds: ['supply'] }));

        expect(event?.kinds).toEqual(['supply']);
        expect(event?.summary).toBe(
            'Поставка: Гарант-Максимум, Интернет 5 ОД, 12 000 ₽',
        );
    });

    it('идентификаторы из строк приводятся к числам', () => {
        const event = buildSalesDocumentEvent(
            base({ userId: '6', companyId: 32442, dealId: '35018' }),
        );

        expect(event).toMatchObject({
            userId: 6,
            companyId: 32442,
            dealId: 35018,
        });
    });

    it('createdAt — ISO-строка момента формирования', () => {
        expect(buildSalesDocumentEvent(base())?.createdAt).toBe(
            CREATED_AT.toISOString(),
        );
    });
});

describe('buildSalesDocumentEvent: презентация', () => {
    it('блок не передан: события «после презентации» нет, строки не уходят', () => {
        const event = buildSalesDocumentEvent(base());

        expect(event).not.toHaveProperty('presentation');
        expect(event).not.toHaveProperty('productRows');
    });

    it('presentation: null равно «не передан»', () => {
        const event = buildSalesDocumentEvent(base({ presentation: null }));

        expect(event).not.toHaveProperty('presentation');
    });

    it('пустой блок остаётся пустым объектом: воркер возьмёт последнюю презентацию', () => {
        const event = buildSalesDocumentEvent(base({ presentation: {} }));

        expect(event?.presentation).toEqual({});
    });

    it('блок с dealId переходит в событие как есть', () => {
        const event = buildSalesDocumentEvent(
            base({ presentation: { dealId: 777 } }),
        );

        expect(event?.presentation).toEqual({ dealId: 777 });
    });

    it('мусорный dealId даёт пустой блок, но событие остаётся «после презентации»', () => {
        const event = buildSalesDocumentEvent(
            base({ presentation: { dealId: 0 } }),
        );

        expect(event?.presentation).toEqual({});
    });

    it('после презентации в событие уходят товарные строки общего набора', () => {
        const event = buildSalesDocumentEvent(base({ presentation: {} }));

        expect(event?.productRows).toEqual([
            {
                productName: 'Гарант-Максимум',
                price: 1000,
                quantity: 12,
                priceNetto: 1200,
                discountSum: 200,
                discountTypeId: 1,
                measureCode: '15',
                measureId: 15,
                sort: 0,
            },
        ]);
    });

    it('после презентации без пригодных строк поле productRows не добавляется', () => {
        const event = buildSalesDocumentEvent(
            base({
                presentation: { dealId: 5 },
                sources: [{ rows: [priceRow({ quantity: 0 })] }],
            }),
        );

        expect(event).not.toHaveProperty('productRows');
        expect(event?.presentation).toEqual({ dealId: 5 });
    });
});

describe('buildSalesDocumentEvent: нехватка данных', () => {
    it.each([
        ['нет домена', { domain: '' }],
        ['нет пользователя', { userId: null }],
        ['нет компании', { companyId: undefined }],
        ['нет сделки', { dealId: 0 }],
        ['нет номера события', { eventId: '' }],
        ['нет ни одного вида', { kinds: [] }],
    ] as const)('%s: событие не собирается', (_title, over) => {
        expect(buildSalesDocumentEvent(base(over))).toBeNull();
    });

    it('нет документов: событие собирается без суммы, текст — только вид', () => {
        const event = buildSalesDocumentEvent(base({ sources: [] }));

        expect(event).not.toHaveProperty('sum');
        expect(event?.summary).toBe('КП');
    });
});
