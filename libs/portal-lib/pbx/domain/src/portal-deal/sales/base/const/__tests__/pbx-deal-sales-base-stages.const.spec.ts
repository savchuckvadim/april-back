import {
    getSalesBaseStageOrder,
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    PBX_DEAL_SALES_BASE_STAGES,
    PBX_DEAL_SALES_BASE_WON_ORDER,
} from '../pbx-deal-sales-base-stages.const';

describe('PBX_DEAL_SALES_BASE_STAGES', () => {
    it('лестница строго монотонна по order без пропусков', () => {
        PBX_DEAL_SALES_BASE_STAGES.forEach((stage, index) => {
            expect(stage.order).toBe(index + 1);
        });
    });

    /*
     * «Доработка» между презентацией и документами: клиента дорабатывают
     * (компания, ИНН) ПОСЛЕ презентации и ДО подготовки документов.
     */
    it('порядок середины воронки: pres(4) → refine(5) → offer_create(6) → document_send(7)', () => {
        expect(getSalesBaseStageOrder('sales_pres')).toBe(4);
        expect(getSalesBaseStageOrder('sales_refine')).toBe(5);
        expect(getSalesBaseStageOrder('sales_offer_create')).toBe(6);
        expect(getSalesBaseStageOrder('sales_document_send')).toBe(7);
        expect(getSalesBaseStageOrder('sales_in_progress')).toBe(8);
    });

    it('доработка идёт ДО документов, а не после отправки', () => {
        expect(getSalesBaseStageOrder('sales_refine')).toBeLessThan(
            getSalesBaseStageOrder('sales_offer_create'),
        );
        expect(getSalesBaseStageOrder('sales_refine')).toBeGreaterThan(
            getSalesBaseStageOrder('sales_pres'),
        );
    });

    /*
     * WON_ORDER обязан совпадать со стадией «Успех»: kpi-report-sales по
     * нему отсекает «горячие» стадии (order < WON), и рассинхрон выкинул бы
     * supply из горячих.
     */
    it('WON_ORDER синхронизирован со стадией «Успех», supply остаётся ниже', () => {
        expect(getSalesBaseStageOrder('sales_success')).toBe(
            PBX_DEAL_SALES_BASE_WON_ORDER,
        );
        expect(PBX_DEAL_SALES_BASE_WON_ORDER).toBe(11);
        expect(getSalesBaseStageOrder('sales_supply')).toBeLessThan(
            PBX_DEAL_SALES_BASE_WON_ORDER,
        );
    });

    /* Отрицательные финалы стоят ниже «Успеха» и не попадают в «горячие». */
    it('отрицательные финалы (fail/double/not_ca) выше WON по порядку', () => {
        [
            PBX_DEAL_SALES_BASE_STAGE_CODE.fail,
            PBX_DEAL_SALES_BASE_STAGE_CODE.apology,
            PBX_DEAL_SALES_BASE_STAGE_CODE.notCa,
        ].forEach(code => {
            expect(getSalesBaseStageOrder(code)).toBeGreaterThan(
                PBX_DEAL_SALES_BASE_WON_ORDER,
            );
        });
    });

    it('коды стадий уникальны', () => {
        const codes = PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('именованные коды указывают на существующие стадии лестницы', () => {
        const codes = new Set<string>(
            PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code),
        );
        Object.values(PBX_DEAL_SALES_BASE_STAGE_CODE).forEach(code => {
            expect(codes.has(code)).toBe(true);
        });
    });
});
