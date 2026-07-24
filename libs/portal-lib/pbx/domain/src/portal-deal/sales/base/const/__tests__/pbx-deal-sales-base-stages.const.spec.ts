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

    it('содержит ключевые стадии: sales_pres(4), sales_offer_create(5), sales_success(10)', () => {
        expect(getSalesBaseStageOrder('sales_pres')).toBe(4);
        expect(getSalesBaseStageOrder('sales_offer_create')).toBe(5);
        expect(getSalesBaseStageOrder('sales_success')).toBe(
            PBX_DEAL_SALES_BASE_WON_ORDER,
        );
    });

    it('коды стадий уникальны', () => {
        const codes = PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code);
        expect(new Set(codes).size).toBe(codes.length);
    });
});
