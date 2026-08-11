import { LeadToWorkStageResolver } from '../services/lead-to-work-stage.resolver';
import { buildLeadToWorkItem } from '../dto/lead-to-work.dto';

/** Портал с настраиваемым подмножеством сопоставленных сущностей. */
const makePortal = (config: {
    salesBase?: { stages: { code: string; bitrixId: string }[] };
    salesXo?: { stages: { code: string; bitrixId: string }[] };
    leadStages?: Record<string, string>;
    leadStatusByCode?: Record<string, string>;
}) => ({
    getDealCategoryByCode: (code: string) => {
        if (code === 'sales_base' && config.salesBase) {
            return { bitrixId: '3', stages: config.salesBase.stages };
        }
        if (code === 'sales_xo' && config.salesXo) {
            return { bitrixId: '9', stages: config.salesXo.stages };
        }
        return undefined;
    },
    getLeadStageCodeByStatusId: (statusId: string) =>
        config.leadStages?.[statusId],
    getLeadStatusIdByCode: (code: string) => config.leadStatusByCode?.[code],
});

const item = (over: Parameters<typeof buildLeadToWorkItem>[0]) =>
    buildLeadToWorkItem(over);

describe('LeadToWorkStageResolver — graceful degradation', () => {
    it('всё сопоставлено: cold-режим даёт sales_cold + статус лида', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({
                salesBase: {
                    stages: [{ code: 'sales_cold', bitrixId: 'COLD' }],
                },
                leadStatusByCode: { lead_taken_in_work: 'PBX_TAKEN_IN_WORK' },
            }) as never,
        ).withCurrentLeadStatus('NEW');

        const plan = resolver.resolve(
            item({ leadId: 1, responsible: 5, stageMode: 'cold' }),
            false,
            false,
        );

        expect(plan.dealStageId).toBe('C3:COLD');
        expect(plan.leadStatusId).toBe('PBX_TAKEN_IN_WORK');
        expect(plan.warnings).toEqual([]);
    });

    it('нет воронки ОП — жёсткая ошибка (единственный hard-fail)', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({}) as never,
        ).withCurrentLeadStatus('NEW');
        expect(() =>
            resolver.resolve(item({ leadId: 1, responsible: 5 }), false, false),
        ).toThrow('sales_base');
    });

    it('стадия не сопоставлена — сделка в дефолтной стадии + warning, не ошибка', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({
                salesBase: { stages: [] },
            }) as never,
        ).withCurrentLeadStatus('NEW');

        const plan = resolver.resolve(
            item({ leadId: 1, responsible: 5, stageMode: 'cold' }),
            false,
            false,
        );

        expect(plan.dealCategoryId).toBe('3');
        expect(plan.dealStageId).toBeUndefined();
        expect(plan.warnings.some(w => w.includes('sales_cold'))).toBe(true);
    });

    it('from_lead с зеркалом: сделка в зеркальной стадии, лид остаётся на месте', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({
                salesBase: {
                    stages: [{ code: 'sales_pres', bitrixId: 'PRES' }],
                },
                leadStages: { UC_PRES: 'lead_pres' },
                leadStatusByCode: { lead_company_work: 'PBX_COMPANY_WORK' },
            }) as never,
        ).withCurrentLeadStatus('UC_PRES');

        const plan = resolver.resolve(
            item({ leadId: 1, responsible: 5, stageMode: 'from_lead' }),
            true,
            false,
        );

        expect(plan.dealStageId).toBe('C3:PRES');
        // Зеркальная стадия → статус лида НЕ двигаем (решение ТЗ).
        expect(plan.leadStatusId).toBeUndefined();
    });

    it('статус лида: компания есть → lead_company_work; стадии нет в БД → скип + warning', () => {
        const withStage = new LeadToWorkStageResolver(
            makePortal({
                salesBase: { stages: [] },
                leadStatusByCode: { lead_company_work: 'PBX_COMPANY_WORK' },
            }) as never,
        ).withCurrentLeadStatus('NEW');
        expect(
            withStage.resolve(
                item({ leadId: 1, responsible: 5, stageMode: 'cold' }),
                true,
                false,
            ).leadStatusId,
        ).toBe('PBX_COMPANY_WORK');

        const withoutStage = new LeadToWorkStageResolver(
            makePortal({ salesBase: { stages: [] } }) as never,
        ).withCurrentLeadStatus('NEW');
        const plan = withoutStage.resolve(
            item({ leadId: 1, responsible: 5, stageMode: 'cold' }),
            true,
            false,
        );
        expect(plan.leadStatusId).toBeUndefined();
        expect(plan.warnings.some(w => w.includes('lead_company_work'))).toBe(
            true,
        );
    });

    it('CONVERTED-лид: статус не трогаем даже при сопоставленной стадии', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({
                salesBase: { stages: [] },
                leadStatusByCode: { lead_taken_in_work: 'PBX_TAKEN_IN_WORK' },
            }) as never,
        ).withCurrentLeadStatus('CONVERTED');

        const plan = resolver.resolve(
            item({ leadId: 1, responsible: 5, stageMode: 'cold' }),
            false,
            true,
        );

        expect(plan.leadStatusId).toBeUndefined();
        expect(plan.warnings.some(w => w.includes('CONVERTED'))).toBe(true);
    });

    it('isXo=Y: лид идёт в «Назначена менеджеру» (назначение ≠ принятие)', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({
                salesBase: {
                    stages: [{ code: 'sales_cold', bitrixId: 'COLD' }],
                },
                leadStatusByCode: {
                    lead_assigned: 'PBX_ASSIGNED',
                    lead_taken_in_work: 'PBX_TAKEN_IN_WORK',
                },
            }) as never,
        ).withCurrentLeadStatus('NEW');

        const plan = resolver.resolve(
            item({ leadId: 1, responsible: 5, isXo: 'Y', stageMode: 'cold' }),
            false,
            false,
        );
        expect(plan.leadStatusId).toBe('PBX_ASSIGNED');
    });

    it('isXo=Y без стадии «Назначена»: graceful откат на «Взята в работу»', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({
                salesBase: {
                    stages: [{ code: 'sales_cold', bitrixId: 'COLD' }],
                },
                leadStatusByCode: { lead_taken_in_work: 'PBX_TAKEN_IN_WORK' },
            }) as never,
        ).withCurrentLeadStatus('NEW');

        const plan = resolver.resolve(
            item({ leadId: 1, responsible: 5, isXo: 'Y', stageMode: 'cold' }),
            false,
            false,
        );
        expect(plan.leadStatusId).toBe('PBX_TAKEN_IN_WORK');
    });

    it('isXo=Y без воронки ХО: warning, xo-план пуст, операция живёт', () => {
        const resolver = new LeadToWorkStageResolver(
            makePortal({
                salesBase: { stages: [] },
            }) as never,
        ).withCurrentLeadStatus('NEW');

        const plan = resolver.resolve(
            item({ leadId: 1, responsible: 5, isXo: 'Y', stageMode: 'cold' }),
            false,
            false,
        );

        expect(plan.xoCategoryId).toBeUndefined();
        expect(plan.warnings.some(w => w.includes('sales_xo'))).toBe(true);
    });
});
