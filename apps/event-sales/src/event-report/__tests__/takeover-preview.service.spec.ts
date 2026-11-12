import { IBXDeal } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { ColdRelations } from '../../cold-hook-v2/services/relations/cold-relations.types';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventReportTakeoverPreviewService } from '../services/takeover/takeover-preview.service';
import {
    NO_REPORT_TAKEOVER,
    ReportTakeoverSettings,
} from '../services/takeover/takeover.settings';

const collected: { relations: ColdRelations | null } = { relations: null };
jest.mock(
    '../../cold-hook-v2/services/relations/cold-relations-collector.service',
    () => ({
        ColdRelationsCollectorV2Service: jest.fn().mockImplementation(() => ({
            collect: () => Promise.resolve(collected.relations),
        })),
    }),
);

/**
 * Предпросмотр перехвата: спрашивать ли «Забрать себе?» и что показать —
 * без единой записи в Битрикс.
 */
const MANAGER = 323;
const COLLEAGUE = 39;

const deal = (id: number, owner: number, title: string): IBXDeal =>
    ({
        ID: String(id),
        ASSIGNED_BY_ID: String(owner),
        CATEGORY_ID: '97',
        STAGE_ID: 'C97:UC_YJOC8K',
        TITLE: title,
        DATE_MODIFY: '2026-11-12T15:00:00+03:00',
    }) as unknown as IBXDeal;

const COLLEAGUE_DEAL = deal(217611, COLLEAGUE, 'Прозвон: ООО «Би Хай»');
const ORPHAN = deal(217823, 0, 'Прозвон: ООО «Би Хай»');

const portal = {
    getDealCategoryByCode: (code: string) =>
        code === 'sales_base' ? { bitrixId: 97, code, stages: [] } : null,
    getDealCategories: () => [],
    getEntityFieldByCode: () => null,
};

const setup = (settings: ReportTakeoverSettings) => {
    const writes: string[] = [];
    const bitrix = {
        user: {
            get: ({ ID }: { ID: number }) =>
                Promise.resolve({
                    result: [{ ID, NAME: 'Марина', LAST_NAME: 'Гончар' }],
                }),
        },
        batch: new Proxy(
            {},
            {
                get: () =>
                    new Proxy(
                        {},
                        {
                            get: (_t, method) => () =>
                                writes.push(String(method)),
                        },
                    ),
            },
        ),
    };
    const service = new EventReportTakeoverPreviewService(
        {
            init: () => Promise.resolve({ bitrix, PortalModel: portal }),
        } as never,
        {
            loadContext: (
                _dto: unknown,
                _b: unknown,
                _p: unknown,
                options: { force: boolean },
            ) =>
                Promise.resolve({
                    entityId: 116533,
                    entityType: 'company',
                    company: { ID: '116533', TITLE: 'ООО «Би Хай»' },
                    currentBaseDeal: options.force ? COLLEAGUE_DEAL : null,
                    currentXoDeal: null,
                    currentPresDeal: null,
                    currentTmcDeal: null,
                    currentTask: null,
                    takeover: options.force
                        ? {
                              mode: 'force',
                              reporterId: MANAGER,
                              botOwnerIds: [],
                              takenDeal: COLLEAGUE_DEAL,
                              duplicateDeals: [ORPHAN],
                              duplicateXoDeals: [],
                              protectedDeals: [],
                          }
                        : null,
                }),
        } as never,
        { takeoverSettings: () => Promise.resolve(settings) } as never,
        { resolve: () => Promise.resolve({ pres: null, zpr: null }) } as never,
    );
    return { service, writes };
};

const dto = {
    domain: 'gsr.bitrix24.ru',
    plan: { responsibility: { ID: MANAGER } },
} as unknown as EventSalesFlowDto;

describe('EventReportTakeoverPreviewService', () => {
    beforeEach(() => {
        collected.relations = {
            deals: [COLLEAGUE_DEAL, ORPHAN],
            openBaseDeals: [COLLEAGUE_DEAL, ORPHAN],
            dealIds: [],
            leadIds: [],
            tasks: [
                {
                    id: '1',
                    responsibleId: String(COLLEAGUE),
                    ufCrmTask: ['D_217611'],
                },
                {
                    id: '2',
                    responsibleId: String(COLLEAGUE),
                    ufCrmTask: ['CO_116533'],
                },
            ] as unknown as IBXTask[],
            pres: { info: null, rows: [] },
            zpr: { info: null, rows: [] },
        };
    });

    it('перехват с подтверждением и чужая работа есть — спросить и показать, что перейдёт и закроется', async () => {
        const { service, writes } = setup({
            ...NO_REPORT_TAKEOVER,
            force: true,
            confirm: true,
        });

        const preview = await service.preview(dto);

        expect(preview.ask).toBe(true);
        expect(preview.takenDeal).toEqual({
            id: 217611,
            title: 'Прозвон: ООО «Би Хай»',
            ownerName: 'Марина Гончар',
            kind: 'base',
        });
        expect(preview.closeDeals).toEqual([
            {
                id: 217823,
                title: 'Прозвон: ООО «Би Хай»',
                ownerName: 'без ответственного',
                kind: 'base',
            },
        ]);
        expect(preview.movedTasks).toBe(1);
        expect(preview.closedTasks).toBe(1);
        expect(writes).toEqual([]);
    });

    it('подтверждение выключено — не спрашивать', async () => {
        const { service } = setup({
            ...NO_REPORT_TAKEOVER,
            force: true,
            confirm: false,
        });

        expect((await service.preview(dto)).ask).toBe(false);
    });

    it('перехват выключен — не спрашивать', async () => {
        const { service } = setup(NO_REPORT_TAKEOVER);

        expect((await service.preview(dto)).ask).toBe(false);
    });
});
