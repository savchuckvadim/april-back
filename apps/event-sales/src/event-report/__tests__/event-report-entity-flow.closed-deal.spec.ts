import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../services/context/event-report.context';
import { EventReportEntityFlowService } from '../services/entity/event-report-entity-flow.service';

jest.mock('../services/entity/event-report-entity-fields.model', () => ({
    EDealRole: { BASE: 'base' },
    EventReportEntityFieldsModel: jest.fn().mockImplementation(() => ({
        toFields: () => ({ UF_CRM_OP_IS_IN_REFINE: 1 }),
        toPresentationSurveyFields: () => ({}),
    })),
}));

jest.mock('../services/entity/event-report-company-backfill.model', () => ({
    EventReportCompanyBackfillModel: jest.fn().mockImplementation(() => ({
        toFields: () => ({}),
    })),
}));

jest.mock('../services/entity/event-report-contact-fields.model', () => ({
    EventReportContactFieldsModel: jest.fn(),
    resolveEventContacts: () => [],
}));

const makeCtx = (over: Record<string, unknown>) =>
    ({
        entityType: 'deal',
        entityId: 28477,
        ownerDeal: { ID: '28477', CATEGORY_ID: '31' },
        company: null,
        lead: null,
        closedLaunchBaseDeal: null,
        currentBaseDeal: null,
        ...over,
    }) as unknown as EventReportContext;

const makeService = () => {
    const dealUpdate = jest.fn();
    const service = new EventReportEntityFlowService(
        {
            batch: {
                deal: { update: dealUpdate },
                company: { update: jest.fn() },
                lead: { update: jest.fn() },
            },
        } as unknown as BitrixService,
        {} as PortalModel,
    );
    return { service, dealUpdate };
};

/*
 * garant 30.10.2026: доработка из закрытой #28477 ушла в новую #110153, а
 * метки доработки и история встали на закрытую — поля отчёта писались в
 * сделку запуска. Закрытая остаётся как была.
 */
describe('EventReportEntityFlowService: закрытая сделка запуска', () => {
    it('работа ушла в новую — поля отчёта в закрытую не пишутся', () => {
        const { service, dealUpdate } = makeService();

        service.queue(
            makeCtx({ closedLaunchBaseDeal: { ID: '28477', CLOSED: 'Y' } }),
        );

        expect(dealUpdate).not.toHaveBeenCalled();
    });

    it('сделку запуска вернули в работу — поля пишутся как обычно', () => {
        const { service, dealUpdate } = makeService();

        service.queue(makeCtx({ reopenedBaseDeal: true }));

        expect(dealUpdate).toHaveBeenCalledWith(
            'update_entity_deal_28477',
            28477,
            { UF_CRM_OP_IS_IN_REFINE: 1 },
        );
    });
});
