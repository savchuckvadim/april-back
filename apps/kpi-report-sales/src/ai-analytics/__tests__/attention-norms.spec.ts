import { toFunnelWithNorms } from '../domain/assembler/funnel-edges.assembler';
import type { ManagerNorms } from '../domain/assembler/norms.assembler';
import {
    buildAttentionItems,
    toAttentionInput,
    toAttentionInputPhase2,
} from '../domain/presenter/attention.presenter';
import { kpiPeriod, managerRow, NORM_EDGE } from './fixtures/norms.fixture';

/** Нормы по трём рёбрам: презентации, счета, продажи. */
function normsOf(
    presentations: number,
    invoices: number,
    deals: number,
): ManagerNorms {
    const edge = (code: string, mu: number, n: number) => ({
        edge: code,
        mu,
        layer: 'tenure' as const,
        n,
        w: 0.8,
        kappa: 30,
        portalMu: null,
        flag: null,
    });

    return {
        managerId: '10',
        tenureBand: '6-18',
        edges: [
            edge(NORM_EDGE, presentations, 400),
            edge('offer_to_invoice', invoices, 200),
            edge('invoice_to_sale', deals, 120),
        ],
    };
}

/** Строка с нормами: 100 звонков → 10 презентаций, 20 КП → 8 счетов → 2 продажи. */
function rowWithNorms(planHead?: number) {
    const kpi = kpiPeriod({
        calls: 100,
        presentations: 10,
        offers: 20,
        invoices: 8,
        success: 2,
    });

    return managerRow({
        kpi,
        funnel: toFunnelWithNorms(kpi, normsOf(0.25, 0.5, 0.3)),
        ...(planHead === undefined ? {} : { planHead }),
    });
}

describe('«Внимание» Фазы 2: разрыв плана, исходы и нормы уровня', () => {
    it('исходы и нормы уровня приходят из рёбер строки', () => {
        const input = toAttentionInputPhase2(rowWithNorms());

        expect(input.outcomes).toEqual({ invoices: 8, deals: 2 });
        // Норма уровня в единицах исхода: μ слоя × знаменатель ребра.
        expect(input.levelNorms?.invoices).toBeCloseTo(0.5 * 20, 6);
        expect(input.levelNorms?.deals).toBeCloseTo(0.3 * 8, 6);
    });

    it('разрыв плана: план руководителя против нормы по презентациям', () => {
        const input = toAttentionInputPhase2(rowWithNorms(60));

        expect(input.planGap).toEqual({ norm: 25, planHead: 60 });
    });

    it('сигнал plan_gap появляется, когда план вдвое выше нормы', () => {
        const items = buildAttentionItems([rowWithNorms(60)]);
        const signals = items.map(item => item.signal);

        expect(signals).toContain('plan_gap');
        const card = items.find(item => item.signal === 'plan_gap');
        expect(card?.basis[0]).toMatchObject({
            code: 'plan_head',
            value: 60,
            norm: 25,
        });
    });

    it('план близок к норме → сигнала нет', () => {
        const items = buildAttentionItems([rowWithNorms(28)]);

        expect(items.map(item => item.signal)).not.toContain('plan_gap');
    });

    it('норм в строке нет → вход совпадает с Фазой 1, новых карточек нет', () => {
        const row = managerRow({
            kpi: kpiPeriod({ calls: 100, presentations: 10 }),
            planHead: 60,
        });

        expect(toAttentionInputPhase2(row)).toEqual(toAttentionInput(row));
        expect(
            buildAttentionItems([row]).map(item => item.signal),
        ).not.toContain('plan_gap');
    });

    it('«закрыватель» (исходы не ниже норм) не получает карточку дисциплины', () => {
        // Звонков 30 из плана 100 — правило дисциплины сработало бы, но
        // счета и продажи выше норм уровня, и карточка не ставится.
        const kpi = kpiPeriod({
            calls: 30,
            presentations: 10,
            offers: 20,
            invoices: 18,
            success: 6,
            callPlan: 100,
        });
        const withoutNorms = managerRow({ kpi });
        const closer = managerRow({
            kpi,
            funnel: toFunnelWithNorms(kpi, normsOf(0.25, 0.5, 0.3)),
        });

        expect(
            buildAttentionItems([withoutNorms]).map(item => item.signal),
        ).toContain('discipline');
        expect(
            buildAttentionItems([closer]).map(item => item.signal),
        ).not.toContain('discipline');
    });
});
