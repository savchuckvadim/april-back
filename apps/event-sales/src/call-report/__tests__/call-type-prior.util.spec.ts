import {
    renderCallTypePrior,
    resolveCallTypePrior,
} from '../services/call-type-prior.util';

describe('resolveCallTypePrior — ожидаемый тип звонка по CRM', () => {
    it('лид из заявки с сайта → сильный site_lead', () => {
        expect(
            resolveCallTypePrior({
                entityType: 'lead',
                dealCategoryCode: null,
                dealStageCode: null,
                leadWorkKind: 'request',
            }),
        ).toEqual(
            expect.objectContaining({
                callType: 'site_lead',
                strength: 'strong',
            }),
        );
    });

    it('лид из обращения или холодный → слабый cold', () => {
        for (const leadWorkKind of ['lead', 'cold', null] as const) {
            expect(
                resolveCallTypePrior({
                    entityType: 'lead',
                    dealCategoryCode: null,
                    dealStageCode: null,
                    leadWorkKind,
                }),
            ).toEqual(
                expect.objectContaining({ callType: 'cold', strength: 'weak' }),
            );
        }
    });

    it('основная воронка: стадии «Презентация»/«Доработка» — сильные приоры, новая/тёплая — слабые', () => {
        const at = (dealStageCode: string) =>
            resolveCallTypePrior({
                entityType: 'deal',
                dealCategoryCode: 'sales_base',
                dealStageCode,
                leadWorkKind: null,
            });
        expect(at('sales_pres')).toEqual(
            expect.objectContaining({
                callType: 'presentation',
                strength: 'strong',
            }),
        );
        expect(at('sales_refine')).toEqual(
            expect.objectContaining({ callType: 'refine', strength: 'strong' }),
        );
        expect(at('sales_new')).toEqual(
            expect.objectContaining({ callType: 'call', strength: 'weak' }),
        );
        expect(at('sales_cold')).toEqual(
            expect.objectContaining({ callType: 'cold', strength: 'weak' }),
        );
        expect(at('sales_money_await')).toEqual(
            expect.objectContaining({
                callType: 'payment',
                strength: 'strong',
            }),
        );
    });

    /**
     * Прод-случай alfacentr 08.09.2026: целевая сделка стояла в «Не
     * состоялась», приора для финалов не было вовсе — и классификатор
     * скатывался в «Другое». Финалы обязаны давать приор, но только слабый:
     * стадия говорит об исходе сделки, а не о содержании звонка.
     */
    it('финалы основной воронки дают слабый приор, а не пустоту', () => {
        const at = (dealStageCode: string) =>
            resolveCallTypePrior({
                entityType: 'deal',
                dealCategoryCode: 'sales_base',
                dealStageCode,
                leadWorkKind: null,
            });
        expect(at('sales_success')).toEqual(
            expect.objectContaining({ callType: 'payment', strength: 'weak' }),
        );
        expect(at('sales_fail')).toEqual(
            expect.objectContaining({ callType: 'decision', strength: 'weak' }),
        );
        // «Не состоялась» и «Не ЦА» — разговор был, но сорвался/не тот клиент.
        expect(at('sales_double')).toEqual(
            expect.objectContaining({ callType: 'call', strength: 'weak' }),
        );
        expect(at('sales_not_ca')).toEqual(
            expect.objectContaining({ callType: 'call', strength: 'weak' }),
        );
    });

    it('воронка презентаций: стадия «Презентация» — сильный presentation, «в работе» — слабый decision', () => {
        const at = (dealStageCode: string) =>
            resolveCallTypePrior({
                entityType: 'deal',
                dealCategoryCode: 'sales_presentation',
                dealStageCode,
                leadWorkKind: null,
            });
        expect(at('sales_presentation_presentation')).toEqual(
            expect.objectContaining({
                callType: 'presentation',
                strength: 'strong',
            }),
        );
        expect(at('sales_presentation_in_progress')).toEqual(
            expect.objectContaining({ callType: 'decision', strength: 'weak' }),
        );
    });

    it('чужая воронка, незнакомая стадия, нет стадии, нет сущности → null', () => {
        expect(
            resolveCallTypePrior({
                entityType: 'deal',
                dealCategoryCode: 'sales_xo',
                dealStageCode: 'sales_xo_new',
                leadWorkKind: null,
            }),
        ).toBeNull();
        expect(
            resolveCallTypePrior({
                entityType: 'deal',
                dealCategoryCode: 'sales_base',
                dealStageCode: 'sales_unknown',
                leadWorkKind: null,
            }),
        ).toBeNull();
        expect(
            resolveCallTypePrior({
                entityType: 'deal',
                dealCategoryCode: 'sales_base',
                dealStageCode: null,
                leadWorkKind: null,
            }),
        ).toBeNull();
        expect(
            resolveCallTypePrior({
                entityType: null,
                dealCategoryCode: null,
                dealStageCode: null,
                leadWorkKind: null,
            }),
        ).toBeNull();
    });

    it('причина приора называет стадию и воронку', () => {
        const prior = resolveCallTypePrior({
            entityType: 'deal',
            dealCategoryCode: 'sales_base',
            dealStageCode: 'sales_pres',
            leadWorkKind: null,
        });
        expect(prior?.reason).toContain('sales_pres');
        expect(prior?.reason).toContain('sales_base');
    });
});

describe('renderCallTypePrior — подсказка классификатору', () => {
    it('null → пустая строка', () => {
        expect(renderCallTypePrior(null)).toBe('');
    });

    it('сильный приор просит отклоняться только при явных признаках, слабый — «содержание важнее»', () => {
        const strong = renderCallTypePrior({
            callType: 'presentation',
            strength: 'strong',
            reason: 'стадия sales_pres',
        });
        expect(strong).toContain("'presentation'");
        expect(strong).toContain('ТОЛЬКО при явных признаках');
        const weak = renderCallTypePrior({
            callType: 'call',
            strength: 'weak',
            reason: 'стадия sales_new',
        });
        expect(weak).toContain('слабая подсказка');
    });
});
