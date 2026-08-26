import { EventReportInitService } from '../services/init/event-report-init.service';
import { EEventReportEntityType } from '../services/init/event-report-init.types';
import {
    EEventReportFlowStrategy,
    EventReportContext,
} from '../services/context/event-report.context';
import { EEvFlowFrom } from '../dto/event-sale-flow/flow-context.dto';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';

/**
 * Матрица resolveEntity: честный context приоритетен, legacy-placement —
 * фолбэк (включая исторический фейковый CRM_COMPANY_DETAIL_TAB).
 */
describe('EventReportInitService.resolveEntity', () => {
    const service = new EventReportInitService();
    const resolve = (dto: Partial<EventSalesFlowDto>) =>
        (
            service as unknown as {
                resolveEntity: (d: Partial<EventSalesFlowDto>) => {
                    entityId: number;
                    entityType: string;
                };
            }
        ).resolveEntity(dto);

    it('context.companyId → company, даже когда есть dealId и leadId', () => {
        expect(
            resolve({
                context: {
                    from: EEvFlowFrom.DEAL,
                    companyId: 431,
                    dealId: 5512,
                    leadId: 7,
                },
            } as Partial<EventSalesFlowDto>),
        ).toEqual({
            entityId: 431,
            entityType: EEventReportEntityType.COMPANY,
        });
    });

    it('context.dealId без companyId → deal (сделка без компании)', () => {
        expect(
            resolve({
                context: { from: EEvFlowFrom.DEAL, dealId: 5512 },
            } as Partial<EventSalesFlowDto>),
        ).toEqual({ entityId: 5512, entityType: EEventReportEntityType.DEAL });
    });

    it('context.leadId → lead', () => {
        expect(
            resolve({
                context: { from: EEvFlowFrom.LEAD, leadId: 318051 },
            } as Partial<EventSalesFlowDto>),
        ).toEqual({
            entityId: 318051,
            entityType: EEventReportEntityType.LEAD,
        });
    });

    it('пустой context падает в legacy-ветку placement', () => {
        expect(
            resolve({
                context: { from: EEvFlowFrom.COMPANY },
                placement: {
                    placement: 'CRM_COMPANY_DETAIL_TAB',
                    options: { ID: 99 },
                },
            } as Partial<EventSalesFlowDto>),
        ).toEqual({ entityId: 99, entityType: EEventReportEntityType.COMPANY });
    });

    it('legacy: фейковый CRM_COMPANY_DETAIL_TAB со старого фронта → company', () => {
        expect(
            resolve({
                placement: {
                    placement: 'CRM_COMPANY_DETAIL_TAB',
                    options: { ID: 431 },
                },
            } as Partial<EventSalesFlowDto>),
        ).toEqual({
            entityId: 431,
            entityType: EEventReportEntityType.COMPANY,
        });
    });

    it('legacy: LEAD-placement → lead, dto.lead.ID приоритетнее options.ID', () => {
        expect(
            resolve({
                placement: {
                    placement: 'CRM_LEAD_DETAIL_ACTIVITY',
                    options: { ID: 1 },
                },
                lead: { ID: 318051 },
            } as Partial<EventSalesFlowDto>),
        ).toEqual({
            entityId: 318051,
            entityType: EEventReportEntityType.LEAD,
        });
    });

    it('без context и placement — фолбэк на dto.lead', () => {
        expect(
            resolve({ lead: { ID: 7 } } as Partial<EventSalesFlowDto>),
        ).toEqual({ entityId: 7, entityType: EEventReportEntityType.LEAD });
    });
});

/**
 * Приоритет сделки плейсмента при выборе текущей сделки категории.
 *
 * Инцидент: приложение открыто из сделки, к ней привязали компанию с другой,
 * более ранней открытой основной сделкой — crm.deal.list (ID ASC) ставил
 * раннюю первой, и отказ закрывал ЕЁ. Сделка запуска обязана побеждать.
 */
describe('EventReportInitService.groupDealsByCategory', () => {
    const service = new EventReportInitService();
    const portal = {
        getDealCategories: () => [
            { bitrixId: 14, code: 'sales_base' },
            { bitrixId: 20, code: 'sales_xo' },
        ],
    };
    const deals = [
        { ID: '100', CATEGORY_ID: '14' },
        { ID: '250', CATEGORY_ID: '14' },
        { ID: '300', CATEGORY_ID: '20' },
    ];
    const group = (preferredDealId?: number | null) =>
        (
            service as unknown as {
                groupDealsByCategory: (
                    d: unknown,
                    p: unknown,
                    pref?: number | null,
                ) => Record<string, { ID: string }>;
            }
        ).groupDealsByCategory(deals, portal, preferredDealId);

    it('без приоритета — первая сделка категории (как раньше)', () => {
        const result = group();
        expect(result['sales_base']?.ID).toBe('100');
        expect(result['sales_xo']?.ID).toBe('300');
    });

    it('сделка плейсмента перебивает первую в своей категории', () => {
        const result = group(250);
        expect(result['sales_base']?.ID).toBe('250');
        expect(result['sales_xo']?.ID).toBe('300');
    });

    it('плейсмент-сделки нет в списке (закрыта/чужая компания) — старое поведение', () => {
        expect(group(999)['sales_base']?.ID).toBe('100');
    });

    it('плейсмент из другой категории не трогает соседнюю', () => {
        const result = group(300);
        expect(result['sales_base']?.ID).toBe('100');
        expect(result['sales_xo']?.ID).toBe('300');
    });
});

/**
 * Правило владельца (25.08): автоподбор текущей сделки категории — только
 * среди сделок «своих» сотрудников (ответственный плана + ответственный
 * закрываемой задачи). Чужая открытая сделка молча не подхватывается:
 * своих нет — категория пустая, flow создаст новую своим штатным путём.
 * Сделка запуска — явный контекст и остаётся вне фильтра.
 */
describe('EventReportInitService.groupDealsByCategory — свои/чужие', () => {
    const service = new EventReportInitService();
    const portal = {
        getDealCategories: () => [
            { bitrixId: 14, code: 'sales_base' },
            { bitrixId: 20, code: 'sales_xo' },
        ],
    };
    const group = (
        deals: unknown[],
        preferredDealId: number | null,
        own: Set<number>,
    ) =>
        (
            service as unknown as {
                groupDealsByCategory: (
                    d: unknown,
                    p: unknown,
                    pref: number | null,
                    own: Set<number>,
                ) => Record<string, { ID: string } | undefined>;
            }
        ).groupDealsByCategory(deals, portal, preferredDealId, own);

    it('своя открытая предпочитается более ранней чужой', () => {
        const deals = [
            { ID: '100', CATEGORY_ID: '14', ASSIGNED_BY_ID: '3' },
            { ID: '250', CATEGORY_ID: '14', ASSIGNED_BY_ID: '8' },
        ];
        expect(group(deals, null, new Set([8]))['sales_base']?.ID).toBe('250');
    });

    it('чужая открытая НЕ подхватывается: своих нет — категория пустая', () => {
        const deals = [
            { ID: '100', CATEGORY_ID: '14', ASSIGNED_BY_ID: '3' },
            { ID: '300', CATEGORY_ID: '20', ASSIGNED_BY_ID: '3' },
        ];
        const result = group(deals, null, new Set([8]));
        expect(result['sales_base']).toBeUndefined();
        expect(result['sales_xo']).toBeUndefined();
    });

    it('ASSIGNED_BY_ID сравнивается ЧИСЛОМ: строка REST матчится с number', () => {
        const deals = [{ ID: '250', CATEGORY_ID: '14', ASSIGNED_BY_ID: '8' }];
        expect(group(deals, null, new Set([8]))['sales_base']?.ID).toBe('250');
    });

    it('сделка запуска вне правила: явный контекст побеждает даже чужой', () => {
        const deals = [
            { ID: '100', CATEGORY_ID: '14', ASSIGNED_BY_ID: '3' },
            { ID: '250', CATEGORY_ID: '14', ASSIGNED_BY_ID: '8' },
        ];
        expect(group(deals, 100, new Set([8]))['sales_base']?.ID).toBe('100');
    });

    it('пустой набор «своих» (легаси-DTO) — фильтр выключен', () => {
        const deals = [{ ID: '100', CATEGORY_ID: '14', ASSIGNED_BY_ID: '3' }];
        expect(group(deals, null, new Set())['sales_base']?.ID).toBe('100');
    });

    it('фильтр посекционный: чужая базовая не мешает своей ХО', () => {
        const deals = [
            { ID: '100', CATEGORY_ID: '14', ASSIGNED_BY_ID: '3' },
            { ID: '300', CATEGORY_ID: '20', ASSIGNED_BY_ID: '8' },
        ];
        const result = group(deals, null, new Set([8]));
        expect(result['sales_base']).toBeUndefined();
        expect(result['sales_xo']?.ID).toBe('300');
    });
});

/**
 * «Свои» сотрудники отчёта: ответственный плана (по умолчанию текущий юзер
 * фрейма) + ответственный закрываемой задачи (при передаче клиента сделка
 * ещё висит на отправителе). Значения приводятся к числу.
 */
describe('EventReportInitService.collectOwnResponsibleIds', () => {
    const service = new EventReportInitService();
    const collect = (dto: unknown) =>
        (
            service as unknown as {
                collectOwnResponsibleIds: (d: unknown) => Set<number>;
            }
        ).collectOwnResponsibleIds(dto);

    it('план + задача на одном юзере — один id, строки приводятся к числу', () => {
        expect(
            collect({
                plan: { responsibility: { ID: '8' } },
                currentTask: { responsibleId: '8' },
            }),
        ).toEqual(new Set([8]));
    });

    it('передача: план на новом менеджере, задача на отправителе — оба свои', () => {
        expect(
            collect({
                plan: { responsibility: { ID: 9 } },
                currentTask: { responsibleId: 8 },
            }),
        ).toEqual(new Set([9, 8]));
    });

    it('легаси-DTO без плана и задачи — пустой набор (фильтр выключен)', () => {
        expect(collect({})).toEqual(new Set());
        expect(collect({ plan: {}, currentTask: {} })).toEqual(new Set());
    });
});

describe('EventReportContext.strategy', () => {
    const makeCtx = (entityType: string) =>
        new EventReportContext(
            {
                report: {},
                plan: {},
                presentation: {},
            } as unknown as EventSalesFlowDto,
            { getPortal: () => ({ domain: 'x.bitrix24.ru' }) } as never,
            {
                entityId: 1,
                entityType,
                company: null,
                lead: null,
                ownerDeal: null,
                currentBaseDeal: null,
                currentXoDeal: null,
                currentPresDeal: null,
                currentTmcDeal: null,
                currentTmcFromPresentation: null,
                currentTask: null,
                reportContact: null,
                planContact: null,
            } as never,
        );

    it('company → COMPANY, deal → DEAL, lead → LEAD_ONLY', () => {
        expect(makeCtx(EEventReportEntityType.COMPANY).strategy).toBe(
            EEventReportFlowStrategy.COMPANY,
        );
        expect(makeCtx(EEventReportEntityType.DEAL).strategy).toBe(
            EEventReportFlowStrategy.DEAL,
        );
        expect(makeCtx(EEventReportEntityType.LEAD).strategy).toBe(
            EEventReportFlowStrategy.LEAD_ONLY,
        );
    });

    it('leadOnly выключает deal-flow даже при наличии типа события', () => {
        const ctx = new EventReportContext(
            {
                report: {},
                plan: {
                    type: { current: { code: 'warm' } },
                },
                presentation: {},
            } as unknown as EventSalesFlowDto,
            { getPortal: () => ({ domain: 'x.bitrix24.ru' }) } as never,
            {
                entityId: 7,
                entityType: EEventReportEntityType.LEAD,
                company: null,
                lead: null,
                ownerDeal: null,
                currentBaseDeal: null,
                currentXoDeal: null,
                currentPresDeal: null,
                currentTmcDeal: null,
                currentTmcFromPresentation: null,
                currentTask: null,
                reportContact: null,
                planContact: null,
            } as never,
        );
        expect(ctx.planEventType).toBe('warm');
        expect(ctx.isDealFlow).toBe(false);
    });

    it('ownerLinkFields: company → COMPANY_ID, lead → LEAD_ID, deal → LEAD_ID из ownerDeal', () => {
        expect(makeCtx(EEventReportEntityType.COMPANY).ownerLinkFields).toEqual(
            { COMPANY_ID: '1' },
        );
        expect(makeCtx(EEventReportEntityType.LEAD).ownerLinkFields).toEqual({
            LEAD_ID: '1',
        });

        const dealCtx = new EventReportContext(
            {
                report: {},
                plan: {},
                presentation: {},
            } as unknown as EventSalesFlowDto,
            { getPortal: () => ({ domain: 'x.bitrix24.ru' }) } as never,
            {
                entityId: 5512,
                entityType: EEventReportEntityType.DEAL,
                company: null,
                lead: null,
                ownerDeal: { ID: '5512', LEAD_ID: '318051' },
                currentBaseDeal: null,
                currentXoDeal: null,
                currentPresDeal: null,
                currentTmcDeal: null,
                currentTmcFromPresentation: null,
                currentTask: null,
                reportContact: null,
                planContact: null,
            } as never,
        );
        expect(dealCtx.ownerLinkFields).toEqual({ LEAD_ID: '318051' });
    });
});
