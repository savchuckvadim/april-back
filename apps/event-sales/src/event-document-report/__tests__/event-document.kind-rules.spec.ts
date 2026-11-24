import {
    SALES_DOCUMENT_KIND,
    SALES_DOCUMENT_KINDS,
    SalesDocumentKind,
} from '@lib/queue';
import {
    EVENT_DOCUMENT_KIND_RULES,
    orderDocumentKinds,
} from '../types/event-document.kind-rules';

const { offer, invoice, contract, supply } = SALES_DOCUMENT_KIND;

/**
 * Таблица правил — единственное место, где вид документа превращается в
 * стадию, поля карточки и типы событий KPI. Тест пригвождает её значения:
 * случайная правка таблицы поменяла бы данные во всех карточках клиентов.
 */
describe('EVENT_DOCUMENT_KIND_RULES — правила видов документов', () => {
    it('правила есть для каждого вида документа', () => {
        expect(Object.keys(EVENT_DOCUMENT_KIND_RULES).sort()).toEqual(
            [...SALES_DOCUMENT_KINDS].sort(),
        );
    });

    const table: {
        kind: SalesDocumentKind;
        title: string;
        statusText: string;
        baseStage: string;
        counterField: string;
        dateField: string | null;
        kpiEventType: string;
        kpiEventAction: string;
    }[] = [
        {
            kind: offer,
            title: 'КП',
            statusText: 'Коммерческое предложение',
            baseStage: 'sales_offer_create',
            counterField: 'op_offer_q',
            dateField: 'op_offer_date',
            kpiEventType: 'ev_offer',
            kpiEventAction: 'act_send',
        },
        {
            kind: invoice,
            title: 'Счет',
            statusText: 'Счет',
            baseStage: 'sales_offer_create',
            counterField: 'op_invoice_q',
            dateField: 'op_invoice_date',
            kpiEventType: 'ev_invoice',
            kpiEventAction: 'act_send',
        },
        {
            kind: contract,
            title: 'Договор',
            statusText: 'Договор',
            baseStage: 'sales_offer_create',
            counterField: 'op_contract_q',
            dateField: 'op_contract_date',
            kpiEventType: 'ev_contract',
            kpiEventAction: 'act_send',
        },
        {
            kind: supply,
            title: 'Отчет о поставке',
            statusText: 'Поставка',
            baseStage: 'sales_supply',
            counterField: 'op_supplies_q',
            dateField: null,
            kpiEventType: 'ev_supply',
            kpiEventAction: 'done',
        },
    ];

    it.each(table)(
        '$kind: название, статус, стадия, счётчик, дата и тип события KPI по таблице',
        ({ kind, ...expected }) => {
            const rule = EVENT_DOCUMENT_KIND_RULES[kind];

            expect(rule).toMatchObject(expected);
        },
    );

    it('договор считается договором, а не КП: свой счётчик, дата и тип события', () => {
        const contractRule = EVENT_DOCUMENT_KIND_RULES[contract];
        const offerRule = EVENT_DOCUMENT_KIND_RULES[offer];

        expect(contractRule.counterField).not.toBe(offerRule.counterField);
        expect(contractRule.dateField).not.toBe(offerRule.dateField);
        expect(contractRule.kpiEventType).not.toBe(offerRule.kpiEventType);
        // Стадия у договора та же, что у КП и счёта (решение владельца).
        expect(contractRule.baseStage).toBe(offerRule.baseStage);
    });

    // Вариант «после презентации» есть только у КП и счёта.
    describe('вариант «после презентации»', () => {
        it('у КП: свои название, статус, счётчик и тип события KPI', () => {
            expect(EVENT_DOCUMENT_KIND_RULES[offer].afterPresentation).toEqual({
                title: 'КП после презентации',
                statusText: 'Коммерческое предложение после презентации',
                counterField: 'op_offer_pres_q',
                kpiEventType: 'ev_offer_pres',
            });
        });

        it('у счёта: свои название, статус, счётчик и тип события KPI', () => {
            expect(
                EVENT_DOCUMENT_KIND_RULES[invoice].afterPresentation,
            ).toEqual({
                title: 'Счет после презентации',
                statusText: 'Счет после презентации',
                counterField: 'op_invoice_pres_q',
                kpiEventType: 'ev_invoice_pres',
            });
        });

        it('у договора и поставки варианта «после презентации» нет', () => {
            expect(
                EVENT_DOCUMENT_KIND_RULES[contract].afterPresentation,
            ).toBeNull();
            expect(
                EVENT_DOCUMENT_KIND_RULES[supply].afterPresentation,
            ).toBeNull();
        });
    });
});

/**
 * Несколько документов одного события ложатся в карточку в фиксированном
 * порядке: статус и стадию определяет последний, поэтому порядок не должен
 * зависеть от того, как конструктор перечислил документы.
 */
describe('orderDocumentKinds — порядок применения документов', () => {
    it('КП идёт раньше счёта, как бы их ни передали', () => {
        expect(orderDocumentKinds([invoice, offer])).toEqual([offer, invoice]);
    });

    it('все виды выстраиваются: КП, счёт, договор, поставка', () => {
        expect(orderDocumentKinds([supply, contract, invoice, offer])).toEqual([
            offer,
            invoice,
            contract,
            supply,
        ]);
    });

    it('повторы схлопываются', () => {
        expect(orderDocumentKinds([offer, offer, invoice, offer])).toEqual([
            offer,
            invoice,
        ]);
    });

    it('пустой список остаётся пустым', () => {
        expect(orderDocumentKinds([])).toEqual([]);
    });

    it('исходный массив не меняется', () => {
        const kinds = [invoice, offer];

        orderDocumentKinds(kinds);

        expect(kinds).toEqual([invoice, offer]);
    });
});
