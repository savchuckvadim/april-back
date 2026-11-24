import { SalesDocumentEventJobData } from '@lib/queue';
import { EventDocumentDealFlowService } from '../services/deal/event-document-deal-flow.service';
import {
    BASE_CATEGORY_BITRIX_ID,
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_PRESENTATION_DEAL_ID,
    PRESENTATION_CATEGORY_BITRIX_ID,
    SnapshotOptions,
    baseStageId,
    fieldKey,
    makeContext,
    makeFakeBitrix,
    makeFakeBuffer,
} from './event-document.fixtures';

const PRODUCT_ROWS = [
    { productName: 'Гарант Бизнес', price: 1000, quantity: 1 },
];

const BASE_DEAL = {
    ID: String(DOCUMENT_BASE_DEAL_ID),
    CATEGORY_ID: BASE_CATEGORY_BITRIX_ID,
    STAGE_ID: baseStageId('sales_warm'),
    [fieldKey('op_offer_q')]: '100',
};

const PRESENTATION_DEAL = {
    ID: String(DOCUMENT_PRESENTATION_DEAL_ID),
    CATEGORY_ID: PRESENTATION_CATEGORY_BITRIX_ID,
    [fieldKey('op_offer_q')]: '4',
};

const run = (
    event: Partial<SalesDocumentEventJobData> = {},
    snapshot: SnapshotOptions = {},
) => {
    const { bitrix, dealUpdates, productRowSets } = makeFakeBitrix();
    const { ctx, portal } = makeContext({
        event,
        snapshot: {
            baseDeal: BASE_DEAL,
            presentationDeal: PRESENTATION_DEAL,
            ...snapshot,
        },
    });

    new EventDocumentDealFlowService(bitrix as never, portal as never).queue(
        ctx,
        makeFakeBuffer(),
    );
    return { dealUpdates, productRowSets };
};

/**
 * Сделки потока документов: основная обновляется всегда, сделка презентации
 * — только когда документ сформирован в продолжение презентации.
 */
describe('EventDocumentDealFlowService — какие сделки обновляются', () => {
    it('документ не после презентации: обновляется только основная, даже если сделка презентации есть в снимке', () => {
        const { dealUpdates } = run();

        expect(dealUpdates).toHaveLength(1);
        expect(dealUpdates[0].cmd).toBe('doc_base_deal');
        expect(dealUpdates[0].id).toBe(DOCUMENT_BASE_DEAL_ID);
    });

    it('товарные строки без «после презентации» никуда не пишутся', () => {
        const { productRowSets } = run({ productRows: PRODUCT_ROWS });

        expect(productRowSets).toEqual([]);
    });

    it('документ после презентации: обновляются обе сделки, основная первой', () => {
        const { dealUpdates } = run({ presentation: {} });

        expect(dealUpdates.map(update => [update.cmd, update.id])).toEqual([
            ['doc_base_deal', DOCUMENT_BASE_DEAL_ID],
            ['doc_pres_deal', DOCUMENT_PRESENTATION_DEAL_ID],
        ]);
    });

    it('у каждой сделки свои счётчики и своя стадия: двигается только основная', () => {
        const [base, presentation] = run({ presentation: {} }).dealUpdates;

        expect(base.fields).toMatchObject({
            STAGE_ID: baseStageId('sales_offer_create'),
            [fieldKey('op_offer_q')]: 101,
        });
        expect(presentation.fields[fieldKey('op_offer_q')]).toBe(5);
        expect(presentation.fields).not.toHaveProperty('STAGE_ID');
    });

    it('после презентации с товарными строками строки уходят в сделку презентации', () => {
        const { productRowSets } = run({
            presentation: {},
            productRows: PRODUCT_ROWS,
        });

        expect(productRowSets).toHaveLength(1);
        expect(productRowSets[0].dto.ownerId).toBe(
            DOCUMENT_PRESENTATION_DEAL_ID,
        );
    });

    it('после презентации, но сделки презентации в снимке нет: обновляется только основная', () => {
        const { dealUpdates, productRowSets } = run(
            { presentation: {}, productRows: PRODUCT_ROWS },
            { presentationDeal: null },
        );

        expect(dealUpdates.map(update => update.cmd)).toEqual([
            'doc_base_deal',
        ]);
        expect(productRowSets).toEqual([]);
    });
});
