import {
    findPbxLeadStage,
    getPbxLeadStageTemplate,
    PBX_LEAD_STAGE_CODES,
    PBX_LEAD_STAGES,
} from '../const/pbx-lead-stages.const';
import { PBX_DEAL_SALES_BASE_STAGES } from '../../../portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

describe('PBX_LEAD_STAGES', () => {
    const groups = Object.keys(PBX_LEAD_STAGES) as Array<
        keyof typeof PBX_LEAD_STAGES
    >;

    it('коды стадий уникальны внутри каждой группы', () => {
        for (const group of groups) {
            const codes = PBX_LEAD_STAGES[group].map(stage => stage.code);
            expect(new Set(codes).size).toBe(codes.length);
        }
    });

    it('bitrixStatusId уникальны внутри группы (среди заданных)', () => {
        for (const group of groups) {
            const ids = PBX_LEAD_STAGES[group]
                .map(stage => stage.bitrixStatusId)
                .filter((id): id is string => id !== null);
            expect(new Set(ids).size).toBe(ids.length);
        }
    });

    it('у каждой create-стадии задан PBX_-префиксный bitrixStatusId', () => {
        for (const group of groups) {
            for (const stage of PBX_LEAD_STAGES[group]) {
                if (stage.installMode !== 'create') continue;
                expect(stage.bitrixStatusId).toMatch(/^PBX_/);
            }
        }
    });

    it('order монотонно возрастает внутри группы', () => {
        for (const group of groups) {
            const orders = PBX_LEAD_STAGES[group].map(stage => stage.order);
            const sorted = [...orders].sort((a, b) => a - b);
            expect(orders).toEqual(sorted);
        }
    });

    it('dealStageCode ссылается только на реальные стадии sales_base', () => {
        const validCodes = new Set(
            PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code),
        );
        for (const group of groups) {
            for (const stage of PBX_LEAD_STAGES[group]) {
                if (!stage.dealStageCode) continue;
                expect(validCodes.has(stage.dealStageCode)).toBe(true);
            }
        }
    });

    it('новые стадии стоят до финальных (order < CONVERTED)', () => {
        const sales = PBX_LEAD_STAGES.sales;
        const converted = sales.find(stage => stage.code === 'lead_converted');
        for (const stage of sales) {
            if (stage.installMode !== 'create') continue;
            expect(stage.order).toBeLessThan(converted?.order ?? 0);
        }
    });

    it('getPbxLeadStageTemplate: неизвестная группа — пустой массив', () => {
        expect(getPbxLeadStageTemplate('unknown')).toEqual([]);
        expect(getPbxLeadStageTemplate('sales').length).toBeGreaterThan(0);
    });

    it('findPbxLeadStage находит стадию SALES по коду', () => {
        expect(findPbxLeadStage('lead_company_work')?.installMode).toBe(
            'create',
        );
        expect(findPbxLeadStage('lead_pres')?.dealStageCode).toBe('sales_pres');
        expect(findPbxLeadStage('nope')).toBeUndefined();
    });

    it('PBX_LEAD_STAGE_CODES совпадает с кодами SALES-шаблона', () => {
        expect(PBX_LEAD_STAGE_CODES).toEqual(
            PBX_LEAD_STAGES.sales.map(stage => stage.code),
        );
    });
});
