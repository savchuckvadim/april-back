import { SALES_DOCUMENT_KIND } from '@lib/queue';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE as STAGE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    documentTargetStageCode,
    resolveDocumentStageMove,
} from '../services/deal/document-target-stage.calculator';

const { offer, invoice, contract, supply } = SALES_DOCUMENT_KIND;

/**
 * Куда документ ведёт основную сделку: КП, счёт и договор — на «Создание
 * КП», поставка — на «Поставку»; при нескольких документах берётся самая
 * дальняя стадия.
 */
describe('documentTargetStageCode — целевая стадия по документам события', () => {
    it.each([
        { name: 'КП', kinds: [offer], expected: STAGE.offerCreate },
        { name: 'счёт', kinds: [invoice], expected: STAGE.offerCreate },
        { name: 'договор', kinds: [contract], expected: STAGE.offerCreate },
        { name: 'отчёт о поставке', kinds: [supply], expected: STAGE.supply },
    ])('$name ведёт на стадию $expected', ({ kinds, expected }) => {
        expect(documentTargetStageCode(kinds)).toBe(expected);
    });

    it('КП вместе с поставкой — берётся самая дальняя стадия «Поставка»', () => {
        expect(documentTargetStageCode([offer, supply])).toBe(STAGE.supply);
        expect(documentTargetStageCode([supply, offer])).toBe(STAGE.supply);
    });

    it('КП со счётом ведут на ту же стадию, что и по отдельности', () => {
        expect(documentTargetStageCode([offer, invoice])).toBe(
            STAGE.offerCreate,
        );
    });

    it('документов нет — целевой стадии нет', () => {
        expect(documentTargetStageCode([])).toBeNull();
    });
});

/**
 * Сделку документ двигает только вперёд по лестнице стадий: назад не
 * откатывает, закрытую сделку не трогает, неизвестную стадию не угадывает.
 */
describe('resolveDocumentStageMove — движение сделки по документу', () => {
    // Любая рабочая стадия до «Создания КП» уступает место КП.
    describe('КП до «Создания КП» — сделка двигается вперёд', () => {
        it.each([
            STAGE.new,
            STAGE.cold,
            STAGE.warm,
            STAGE.presentation,
            STAGE.refine,
        ])('со стадии %s КП ведёт на «Создание КП»', current => {
            expect(resolveDocumentStageMove(current, [offer])).toBe(
                STAGE.offerCreate,
            );
        });
    });

    it('сделка уже на «Создании КП» — повторное КП её не двигает', () => {
        expect(resolveDocumentStageMove(STAGE.offerCreate, [offer])).toBeNull();
    });

    // Позднее КП не возвращает сделку, уже ушедшую дальше по лестнице.
    describe('сделка дальше «Создания КП» — КП не откатывает назад', () => {
        it.each([
            STAGE.documentSend,
            STAGE.inProgress,
            STAGE.moneyAwait,
            STAGE.supply,
        ])('на стадии %s КП сделку не двигает', current => {
            expect(resolveDocumentStageMove(current, [offer])).toBeNull();
        });
    });

    it('поставка двигает сделку с «Ожидания денег» на «Поставку»', () => {
        expect(resolveDocumentStageMove(STAGE.moneyAwait, [supply])).toBe(
            STAGE.supply,
        );
    });

    it('поставка двигает сделку и с более ранних рабочих стадий', () => {
        expect(resolveDocumentStageMove(STAGE.documentSend, [supply])).toBe(
            STAGE.supply,
        );
    });

    it('сделка уже на «Поставке» — повторная поставка её не двигает', () => {
        expect(resolveDocumentStageMove(STAGE.supply, [supply])).toBeNull();
    });

    // Успех, отказ, дубль и прочие финалы стоят выше всех рабочих стадий.
    describe('закрытая сделка не двигается ни одним документом', () => {
        const closedStages: PbxDealSalesBaseStageCode[] = [
            STAGE.success,
            STAGE.fail,
            STAGE.apology,
            STAGE.notCa,
            STAGE.notCall,
            STAGE.duplicate,
        ];

        it.each(closedStages)('на стадии %s КП сделку не двигает', current => {
            expect(resolveDocumentStageMove(current, [offer])).toBeNull();
        });

        it.each(closedStages)('на стадии %s не двигает и поставка', current => {
            expect(resolveDocumentStageMove(current, [supply])).toBeNull();
            expect(
                resolveDocumentStageMove(current, [offer, supply]),
            ).toBeNull();
        });
    });

    it('текущая стадия неизвестна — сделку не двигаем', () => {
        expect(resolveDocumentStageMove(null, [offer])).toBeNull();
        expect(resolveDocumentStageMove(null, [supply])).toBeNull();
    });

    it('документов нет — сделку не двигаем', () => {
        expect(resolveDocumentStageMove(STAGE.warm, [])).toBeNull();
    });
});
