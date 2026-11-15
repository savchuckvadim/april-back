import { PBX_DEAL_SALES_BASE_STAGE_CODE as S } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { decideLeadClosing, LeadClosingInput } from '../lead-closing.decision';

const input = (over: Partial<LeadClosingInput>): LeadClosingInput => ({
    deal: { id: 10, stage: S.warm },
    liveBaseDealId: null,
    hasOpenWorkElsewhere: false,
    ...over,
});

describe('decideLeadClosing — правило закрытия лида по итогу работы', () => {
    it.each([
        S.new,
        S.cold,
        S.warm,
        S.presentation,
        S.refine,
        S.offerCreate,
        S.inProgress,
        S.moneyAwait,
        S.supply,
    ])('сделка в работе (%s) → «Сконвертирован», связь на неё', stage => {
        expect(decideLeadClosing(input({ deal: { id: 10, stage } }))).toEqual({
            target: 'lead_converted',
            linkDealId: 10,
            reason: 'deal_open',
        });
    });

    it('«Успех» и «Отказ» → «Сконвертирован» (отказ — итог сделки, не брак)', () => {
        expect(
            decideLeadClosing(input({ deal: { id: 10, stage: S.success } }))
                .target,
        ).toBe('lead_converted');
        expect(
            decideLeadClosing(input({ deal: { id: 10, stage: S.fail } })),
        ).toEqual({
            target: 'lead_converted',
            linkDealId: 10,
            reason: 'deal_fail',
        });
    });

    it('«Не ЦА» → брак, даже если у клиента есть живая сделка', () => {
        expect(
            decideLeadClosing(
                input({ deal: { id: 10, stage: S.notCa }, liveBaseDealId: 20 }),
            ),
        ).toEqual({
            target: 'lead_junk',
            linkDealId: 10,
            reason: 'deal_not_ca',
        });
    });

    describe('«Не состоялась»', () => {
        const apology = { id: 10, stage: S.apology };

        it('есть живая «ОП Основная» → «Сконвертирован», связь на живую', () => {
            expect(
                decideLeadClosing(
                    input({
                        deal: apology,
                        liveBaseDealId: 20,
                        hasOpenWorkElsewhere: true,
                    }),
                ),
            ).toEqual({
                target: 'lead_converted',
                linkDealId: 20,
                reason: 'apology_live_deal',
            });
        });

        it('работа идёт в другом отделе → «Сконвертирован», связь на компанию (15.11)', () => {
            expect(
                decideLeadClosing(
                    input({ deal: apology, hasOpenWorkElsewhere: true }),
                ),
            ).toEqual({
                target: 'lead_converted',
                linkDealId: null,
                reason: 'apology_work_elsewhere',
            });
        });

        it('работы нет нигде → «Не состоялась», связь на саму сделку', () => {
            expect(decideLeadClosing(input({ deal: apology }))).toEqual({
                target: 'lead_apology',
                linkDealId: 10,
                reason: 'apology_no_work',
            });
        });
    });

    it('«Дубль» → «Сконвертирован»: связь на живую сделку, иначе на сам дубль', () => {
        const duplicate = { id: 10, stage: S.duplicate };
        expect(
            decideLeadClosing(input({ deal: duplicate, liveBaseDealId: 20 }))
                .linkDealId,
        ).toBe(20);
        expect(decideLeadClosing(input({ deal: duplicate }))).toEqual({
            target: 'lead_converted',
            linkDealId: 10,
            reason: 'duplicate_no_live',
        });
    });

    it('сделка удалена → только при живой сделке клиента', () => {
        expect(
            decideLeadClosing(input({ deal: null, liveBaseDealId: 20 })),
        ).toEqual({
            target: 'lead_converted',
            linkDealId: 20,
            reason: 'deleted_live_deal',
        });
        expect(decideLeadClosing(input({ deal: null })).target).toBeNull();
    });

    it('«Не Беспокоить» и чужая стадия портала — не трогаем', () => {
        expect(
            decideLeadClosing(input({ deal: { id: 10, stage: S.notCall } }))
                .reason,
        ).toBe('not_call');
        expect(
            decideLeadClosing(
                input({ deal: { id: 10, stage: null }, liveBaseDealId: 20 }),
            ),
        ).toEqual({
            target: null,
            linkDealId: null,
            reason: 'unknown_stage',
        });
    });
});
