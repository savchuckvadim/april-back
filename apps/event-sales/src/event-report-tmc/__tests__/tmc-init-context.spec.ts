import { IBXDeal } from '@/modules/bitrix';
import { IEventReportInitContext } from '../../event-report/services/init/event-report-init.types';
import { resolveTmcDeal, toTmcInitContext } from '../lib/tmc-init-context';
import { isTmcReport } from '../lib/is-tmc-report';

/**
 * Контекст потока ТМЦ: базой отчёта становится ТМЦ-сделка, сделки отдела
 * продаж для потока не существуют. Выбор ТМЦ-сделки — как в легаси: связь
 * задачи важнее открытой сделки компании.
 */
const deal = (id: string, over: Partial<IBXDeal> = {}): IBXDeal =>
    ({ ID: id, STAGE_ID: 'C103:PLAN', ...over }) as IBXDeal;

const init = (
    over: Partial<IEventReportInitContext> = {},
): IEventReportInitContext =>
    ({
        entityId: 431,
        entityType: 'company',
        company: { ID: '431' },
        lead: null,
        ownerDeal: null,
        currentBaseDeal: deal('100'),
        currentXoDeal: deal('200'),
        currentPresDeal: deal('300'),
        currentTmcDeal: null,
        currentTmcFromPresentation: deal('400'),
        companyTmcDeal: null,
        currentTask: null,
        reportContact: null,
        planContact: null,
        reopenedBaseDeal: true,
        closedLaunchBaseDeal: deal('99'),
        foreignBaseDeal: deal('98'),
        ...over,
    }) as IEventReportInitContext;

describe('resolveTmcDeal', () => {
    it('ТМЦ-сделка из связи задачи важнее открытой сделки компании', () => {
        const fromTask = deal('500');
        expect(
            resolveTmcDeal(
                init({ currentTmcDeal: fromTask, companyTmcDeal: deal('600') }),
            ),
        ).toBe(fromTask);
    });

    it('задача на ТМЦ-сделку не ссылается — берётся открытая ТМЦ-сделка компании', () => {
        const ofCompany = deal('600');
        expect(resolveTmcDeal(init({ companyTmcDeal: ofCompany }))).toBe(
            ofCompany,
        );
    });

    it('ни той, ни другой — null: сделку создаст отчёт', () => {
        expect(resolveTmcDeal(init())).toBeNull();
    });
});

describe('toTmcInitContext', () => {
    it('ТМЦ-сделка становится базой, сделки ОП и правила закрытой сделки запуска гасятся', () => {
        const tmc = deal('500');
        const ctx = toTmcInitContext(init(), tmc);

        expect(ctx.currentBaseDeal).toBe(tmc);
        expect(ctx.currentTmcDeal).toBe(tmc);
        expect(ctx.currentXoDeal).toBeNull();
        expect(ctx.currentPresDeal).toBeNull();
        expect(ctx.currentTmcFromPresentation).toBeNull();
        expect(ctx.reopenedBaseDeal).toBe(false);
        expect(ctx.closedLaunchBaseDeal).toBeNull();
        expect(ctx.foreignBaseDeal).toBeNull();
    });

    it('владелец, компания и контакты остаются как есть', () => {
        const source = init({
            planContact: { ID: '9' } as never,
            companyTmcDeal: deal('600'),
        });
        const ctx = toTmcInitContext(source, null);

        expect(ctx.entityId).toBe(431);
        expect(ctx.company).toBe(source.company);
        expect(ctx.planContact).toBe(source.planContact);
        expect(ctx.currentBaseDeal).toBeNull();
        expect(ctx.companyTmcDeal).toBe(source.companyTmcDeal);
    });
});

describe('isTmcReport', () => {
    it('режим ТМЦ — по коду подразделения в DTO', () => {
        expect(
            isTmcReport({
                departament: { mode: { id: 2, code: 'tmc', name: 'ТМЦ' } },
            }),
        ).toBe(true);
    });

    it('отдел продаж и отчёт без подразделения — не ТМЦ', () => {
        expect(
            isTmcReport({
                departament: {
                    mode: {
                        id: 1,
                        code: 'sales',
                        name: 'Менеджер по продажам',
                    },
                },
            }),
        ).toBe(false);
        expect(isTmcReport({})).toBe(false);
        expect(isTmcReport({ departament: {} })).toBe(false);
    });
});
