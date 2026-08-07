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
