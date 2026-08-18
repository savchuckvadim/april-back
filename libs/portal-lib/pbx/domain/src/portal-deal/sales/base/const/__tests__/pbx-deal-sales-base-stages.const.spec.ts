import {
    getSalesBaseStageOrder,
    PBX_DEAL_SALES_BASE_STAGES,
    PBX_DEAL_SALES_BASE_WON_ORDER,
} from '../pbx-deal-sales-base-stages.const';

describe('PBX_DEAL_SALES_BASE_STAGES', () => {
    it('лестница строго монотонна по order без пропусков', () => {
        PBX_DEAL_SALES_BASE_STAGES.forEach((stage, index) => {
            expect(stage.order).toBe(index + 1);
        });
    });

    it('содержит ключевые стадии: sales_pres(4), sales_offer_create(5), sales_refine(7), sales_success(11)', () => {
        expect(getSalesBaseStageOrder('sales_pres')).toBe(4);
        expect(getSalesBaseStageOrder('sales_offer_create')).toBe(5);
        // «Доработка» — между отправкой документов и решением.
        expect(getSalesBaseStageOrder('sales_refine')).toBe(7);
        expect(getSalesBaseStageOrder('sales_in_progress')).toBe(8);
        expect(getSalesBaseStageOrder('sales_success')).toBe(
            PBX_DEAL_SALES_BASE_WON_ORDER,
        );
    });

    /*
     * WON_ORDER обязан совпадать со стадией «Успех»: kpi-report-sales по
     * нему отсекает «горячие» стадии (order < WON), и рассинхрон после
     * вставки sales_refine выкинул бы supply из горячих.
     */
    it('WON_ORDER синхронизирован со вставкой sales_refine: supply остаётся ниже WON', () => {
        expect(PBX_DEAL_SALES_BASE_WON_ORDER).toBe(11);
        expect(getSalesBaseStageOrder('sales_supply')).toBeLessThan(
            PBX_DEAL_SALES_BASE_WON_ORDER,
        );
    });

    it('коды стадий уникальны', () => {
        const codes = PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code);
        expect(new Set(codes).size).toBe(codes.length);
    });
});
