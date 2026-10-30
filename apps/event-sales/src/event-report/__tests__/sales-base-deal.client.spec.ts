import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../services/context/event-report.context';
import { SalesBaseDealService } from '../services/deal/sales-base-deal.service';

jest.mock('../services/entity/event-report-entity-fields.model', () => ({
    EDealRole: { BASE: 'base' },
    EventReportEntityFieldsModel: jest.fn().mockImplementation(() => ({
        toFields: () => ({ UF_CRM_OP_HISTORY: 'отчёт' }),
    })),
}));

jest.mock('../services/deal/deal-target-stage.calculator', () => ({
    composeStageId: (category: string, stage: string) =>
        `C${category}:${stage}`,
    detectEventFromBaseStage: () => null,
    getSalesBaseTargetStageCode: () => 'REFINE',
}));

const makeContext = (over: Partial<EventReportContext>) =>
    ({
        isPostSale: false,
        isSuccessSale: false,
        isFail: false,
        ownerLinkFields: {},
        stageRuleSettings: {},
        workResponsibleId: 433,
        company: null,
        lead: null,
        ownerDeal: {
            ID: 28477,
            TITLE: 'Кацура Александра (3115015)',
            CATEGORY_ID: '31',
            CONTACT_ID: '275105',
        },
        ownerDealContactIds: [275105, 282939],
        planContact: null,
        reportContact: null,
        currentBaseDeal: null,
        ...over,
    }) as unknown as EventReportContext;

const makeService = () => {
    const set = jest.fn();
    const update = jest.fn();
    const service = new SalesBaseDealService(
        { batch: { deal: { set, update } } } as unknown as BitrixService,
        {
            getDealCategoryByCode: () => ({ bitrixId: 31, stages: [] }),
        } as unknown as PortalModel,
    );
    return { service, set, update };
};

describe('SalesBaseDealService: клиент новой сделки', () => {
    it('новая сделка создаётся с названием и контактами сделки запуска', () => {
        const { service, set } = makeService();

        const ref = service.queue(makeContext({}));

        expect(ref).toBe('$result[set_base_deal]');
        const fields = (
            set.mock.calls as [string, Record<string, unknown>][]
        )[0][1];
        expect(fields).toMatchObject({
            TITLE: 'Кацура Александра (3115015)',
            CONTACT_ID: '275105',
            CONTACT_IDS: [275105, 282939],
            UF_CRM_OP_HISTORY: 'отчёт',
        });
    });

    /*
     * CONTACT_IDS в обновлении отвязал бы контакты сделки, а название
     * существующей сделки менеджер мог поставить сам.
     */
    it('обновление существующей сделки не трогает название и контакты', () => {
        const { service, update } = makeService();

        service.queue(
            makeContext({
                currentBaseDeal: {
                    ID: 110153,
                    STAGE_ID: 'C31:NEW',
                } as EventReportContext['currentBaseDeal'],
            }),
        );

        const fields = (
            update.mock.calls as [string, number, Record<string, unknown>][]
        )[0][2];
        expect(fields.TITLE).toBeUndefined();
        expect(fields.CONTACT_ID).toBeUndefined();
        expect(fields.CONTACT_IDS).toBeUndefined();
    });
});
