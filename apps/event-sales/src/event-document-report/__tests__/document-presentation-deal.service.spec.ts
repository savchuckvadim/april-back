import { SalesDocumentEventJobData } from '@lib/queue';
import { DocumentPresentationDealService } from '../services/deal/document-presentation-deal.service';
import {
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_PRESENTATION_DEAL_ID,
    FakePortalOptions,
    PRESENTATION_CATEGORY_BITRIX_ID,
    SnapshotOptions,
    fieldKey,
    makeContext,
    makeFakeBitrix,
    makeFakeBuffer,
} from './event-document.fixtures';

const PRODUCT_ROWS = [
    { productName: 'Гарант Бизнес', price: 1000, quantity: 2 },
    {
        productName: 'Консультации',
        price: 500,
        quantity: 1,
        measureCode: '796',
    },
];

/** Сделка презентации: счётчики КП в ней свои, не такие, как в основной. */
const PRESENTATION_DEAL = {
    ID: String(DOCUMENT_PRESENTATION_DEAL_ID),
    CATEGORY_ID: PRESENTATION_CATEGORY_BITRIX_ID,
    STAGE_ID: `C${PRESENTATION_CATEGORY_BITRIX_ID}:NEW`,
    [fieldKey('op_offer_q')]: '4',
    [fieldKey('op_offer_pres_q')]: '6',
};

const BASE_DEAL = {
    ID: String(DOCUMENT_BASE_DEAL_ID),
    [fieldKey('op_offer_q')]: '100',
    [fieldKey('op_offer_pres_q')]: '200',
};

const run = (
    options: {
        event?: Partial<SalesDocumentEventJobData>;
        snapshot?: SnapshotOptions;
        portal?: FakePortalOptions;
    } = {},
) => {
    const { bitrix, dealUpdates, productRowSets } = makeFakeBitrix();
    const { ctx } = makeContext({
        event: { presentation: {}, ...options.event },
        snapshot: {
            baseDeal: BASE_DEAL,
            presentationDeal: PRESENTATION_DEAL,
            ...options.snapshot,
        },
        portal: options.portal,
    });
    const buffer = makeFakeBuffer();

    new DocumentPresentationDealService(bitrix as never).queue(ctx, buffer);
    return { dealUpdates, productRowSets, buffer };
};

/**
 * Сделка презентации по документу «после презентации»: те же счётчики и
 * даты, что у основной, но считаются от значений САМОЙ презентации, плюс
 * товарные строки документа. Стадию презентации документ не меняет.
 */
describe('DocumentPresentationDealService — сделка презентации по документу', () => {
    it('сделки презентации в снимке нет: команд нет', () => {
        const { dealUpdates, productRowSets, buffer } = run({
            snapshot: { presentationDeal: null },
            event: { productRows: PRODUCT_ROWS },
        });

        expect(dealUpdates).toEqual([]);
        expect(productRowSets).toEqual([]);
        expect(buffer.getCurrentGroupSize()).toBe(0);
    });

    it('сделка пришла без ID: команд нет, писать некуда', () => {
        const { dealUpdates, productRowSets } = run({
            snapshot: { presentationDeal: {} },
            event: { productRows: PRODUCT_ROWS },
        });

        expect(dealUpdates).toEqual([]);
        expect(productRowSets).toEqual([]);
    });

    describe('товарных строк нет', () => {
        it('одна команда deal.update с ключом doc_pres_deal и id сделки презентации', () => {
            const { dealUpdates, productRowSets, buffer } = run();

            expect(dealUpdates).toHaveLength(1);
            expect(dealUpdates[0].cmd).toBe('doc_pres_deal');
            expect(dealUpdates[0].id).toBe(DOCUMENT_PRESENTATION_DEAL_ID);
            expect(productRowSets).toEqual([]);
            expect(buffer.getCurrentGroupSize()).toBe(1);
        });

        it('счётчики КП и «после презентации» читаются из самой сделки презентации, а не из основной', () => {
            const { dealUpdates } = run();

            // В презентации было 4 КП и 6 «после презентации»; в основной —
            // 100 и 200. Берутся первые.
            expect(dealUpdates[0].fields).toMatchObject({
                [fieldKey('op_offer_q')]: 5,
                [fieldKey('op_offer_pres_q')]: 7,
                [fieldKey('op_current_status')]:
                    'Коммерческое предложение после презентации',
            });
        });
    });

    describe('товарные строки есть', () => {
        it('второй командой уходит productRow.set с ключом doc_pres_deal_rows', () => {
            const { dealUpdates, productRowSets, buffer } = run({
                event: { productRows: PRODUCT_ROWS },
            });

            expect(dealUpdates).toHaveLength(1);
            expect(productRowSets).toHaveLength(1);
            expect(productRowSets[0].cmd).toBe('doc_pres_deal_rows');
            expect(buffer.getCurrentGroupSize()).toBe(2);
        });

        it('строки записываются в сделку презентации (ownerType «D»), а не в основную', () => {
            const { productRowSets } = run({
                event: { productRows: PRODUCT_ROWS },
            });

            expect(productRowSets[0].dto).toEqual({
                ownerType: 'D',
                ownerId: DOCUMENT_PRESENTATION_DEAL_ID,
                productRows: PRODUCT_ROWS,
            });
            expect(productRowSets[0].dto.ownerId).not.toBe(
                DOCUMENT_BASE_DEAL_ID,
            );
        });

        it('полей на портале нет — уходят только товарные строки', () => {
            const { dealUpdates, productRowSets } = run({
                event: { productRows: PRODUCT_ROWS },
                portal: { fields: {} },
            });

            expect(dealUpdates).toEqual([]);
            expect(productRowSets).toHaveLength(1);
        });
    });

    it('STAGE_ID сделки презентации не пишется никогда', () => {
        const scenarios: Partial<SalesDocumentEventJobData>[] = [
            {},
            { productRows: PRODUCT_ROWS },
            { kinds: ['supply'] },
            { kinds: ['offer', 'invoice'], sum: 15000 },
        ];

        for (const event of scenarios) {
            const { dealUpdates } = run({ event });

            expect(dealUpdates).toHaveLength(1);
            expect(Object.keys(dealUpdates[0].fields)).not.toContain(
                'STAGE_ID',
            );
        }
    });
});
