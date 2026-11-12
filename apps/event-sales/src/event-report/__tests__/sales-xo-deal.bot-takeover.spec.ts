import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../services/context/event-report.context';
import { SalesXoDealService } from '../services/deal/sales-xo-deal.service';
import { BotTakeover } from '../services/init/bot-takeover';
import { EVENT_REPORT_EVENT_TYPE } from '../types/event-report.event-codes';

// Поля карточки здесь не проверяются — только стадия и ответственный.
jest.mock('../services/entity/event-report-entity-fields.model', () => ({
    EDealRole: { XO: 'xo' },
    EventReportEntityFieldsModel: jest.fn().mockImplementation(() => ({
        toFields: () => ({}),
    })),
}));

/**
 * Сделка ХО бота, чью работу забрал менеджер, закрывается «успехом» даже
 * когда отчёт — обычный звонок (сам по себе ХО-сделку не двигает): иначе
 * она висела бы «Запланирован» на боте (gsr 12.11.2026).
 */
const BOT = 643;
const MANAGER = 557;

const portal = {
    getDealCategoryByCode: () => ({
        bitrixId: 99,
        code: 'sales_xo',
        stages: [
            { bitrixId: 'WON', code: 'cold_success', name: '', order: 0 },
            { bitrixId: 'NORESULT', code: 'cold_noresult', name: '', order: 0 },
        ],
    }),
} as unknown as PortalModel;

const setup = () => {
    const updates: Array<{ id: number; fields: Record<string, unknown> }> = [];
    const bitrix = {
        batch: {
            deal: {
                update: (
                    _cmd: string,
                    id: number,
                    fields: Record<string, unknown>,
                ) => {
                    updates.push({ id, fields });
                },
            },
        },
    } as unknown as BitrixService;
    return { service: new SalesXoDealService(bitrix, portal), updates };
};

const TAKEOVER: BotTakeover = {
    takenDeal: { ID: '215223', ASSIGNED_BY_ID: String(BOT) } as never,
    duplicateDeals: [],
    duplicateXoDeals: [],
    botOwnerIds: [BOT],
};

const ctx = (botTakeover: BotTakeover | null, xoOwner = BOT) =>
    ({
        isNoCall: false,
        currentXoDeal: { ID: '215225', ASSIGNED_BY_ID: String(xoOwner) },
        reportEventType: EVENT_REPORT_EVENT_TYPE.warm,
        isExpired: false,
        isResult: true,
        isSuccessSale: false,
        isFail: false,
        botTakeover,
        ownerLinkFields: {},
        workResponsibleId: MANAGER,
    }) as unknown as EventReportContext;

describe('SalesXoDealService — перехват у бота', () => {
    it('обычный звонок по сделке бота: ХО-сделка — «успех» и менеджеру', () => {
        const { service, updates } = setup();

        service.queue(ctx(TAKEOVER));

        expect(updates).toEqual([
            {
                id: 215225,
                fields: {
                    CATEGORY_ID: '99',
                    STAGE_ID: 'C99:WON',
                    ASSIGNED_BY_ID: String(MANAGER),
                },
            },
        ]);
    });

    it('без перехвата обычный звонок ХО-сделку по-прежнему не двигает', () => {
        const { service, updates } = setup();

        service.queue(ctx(null));

        expect(updates).toEqual([]);
    });

    it('ХО-сделка не бота (своя у менеджера) — перехват её не трогает', () => {
        const { service, updates } = setup();

        service.queue(ctx(TAKEOVER, MANAGER));

        expect(updates).toEqual([]);
    });
});
