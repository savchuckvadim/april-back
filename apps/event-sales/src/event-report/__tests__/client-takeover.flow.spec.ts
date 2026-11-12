import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ColdRelations } from '../../cold-hook-v2/services/relations/cold-relations.types';
import { EventReportContext } from '../services/context/event-report.context';
import { ClientTakeover } from '../services/takeover/client-takeover';
import { ClientTakeoverFlowService } from '../services/takeover/client-takeover.flow';
import {
    planTakeoverCleanup,
    TakeoverCleanupInput,
} from '../services/takeover/takeover-cleanup.plan';

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
 * Чужая работа при перехвате клиента: что передать отчитавшемуся, что
 * закрыть и что оставить (gsr 12.11.2026).
 */
const MANAGER = 323;
const COLLEAGUE = 39;
const BOT = 643;
const LINK = 'UF_CRM_TO_BASE_SALES';

const deal = (
    id: number,
    owner: number,
    category: string,
    extra = {},
): IBXDeal =>
    ({
        ID: String(id),
        ASSIGNED_BY_ID: String(owner),
        CATEGORY_ID: category,
        ...extra,
    }) as unknown as IBXDeal;
const task = (id: number, owner: number, bindings: string[]): IBXTask =>
    ({
        id: String(id),
        responsibleId: String(owner),
        ufCrmTask: bindings,
    }) as unknown as IBXTask;

const TAKEN = deal(217611, COLLEAGUE, '97');
const ORPHAN = deal(217823, 0, '97');
const OWN = deal(218139, MANAGER, '97');
const COLLEAGUE_XO = deal(215241, COLLEAGUE, '99', { [LINK]: '217611' });
const COLLEAGUE_PRES = deal(400, COLLEAGUE, '101');
const TMC = deal(500, COLLEAGUE, '120');

const FORCE: ClientTakeover = {
    mode: 'force',
    reporterId: MANAGER,
    botOwnerIds: [BOT],
    takenDeal: TAKEN,
    duplicateDeals: [ORPHAN],
    duplicateXoDeals: [],
    protectedDeals: [],
};

const planInput = (
    over: Partial<TakeoverCleanupInput> = {},
): TakeoverCleanupInput => ({
    takeover: FORCE,
    deals: [TAKEN, ORPHAN, OWN, COLLEAGUE_XO, COLLEAGUE_PRES, TMC],
    tasks: [
        task(1, COLLEAGUE, ['D_217611', 'CO_116533']),
        task(2, COLLEAGUE, ['CO_116533']),
        task(3, MANAGER, ['D_218139']),
        task(4, 0, ['D_217823']),
    ],
    presRows: [
        { id: 70, assignedById: COLLEAGUE, ufPresDeal: 'D_400' },
        { id: 71, assignedById: MANAGER, ufPresDeal: 'D_218139' },
    ],
    zprRows: [{ id: 80, assignedById: COLLEAGUE }],
    categoryIds: { base: '97', xo: '99', pres: '101' },
    linkKey: LINK,
    keepDealIds: new Set([217611]),
    currentTaskId: null,
    presLinkKeys: ['ufPresDeal'],
    zprLinkKeys: [],
    ...over,
});

describe('planTakeoverCleanup', () => {
    it('задачи забранной сделки — отчитавшемуся, прочие чужие — закрываются, свои — не трогаются', () => {
        const plan = planTakeoverCleanup(planInput());

        expect(plan.reassignTaskIds).toEqual([1]);
        expect(plan.completeTaskIds.sort()).toEqual([2, 4]);
    });

    it('закрываются чужие сделки воронок ОП; своя, забранная и ТМЦ — нет', () => {
        const plan = planTakeoverCleanup(planInput());

        expect(plan.closeDeals.map(item => [item.deal.ID, item.role])).toEqual([
            ['217823', 'base'],
            ['215241', 'xo'],
            ['400', 'pres'],
        ]);
    });

    it('чужие «Презентации» и «ЗПР» закрываются, свои — нет', () => {
        const plan = planTakeoverCleanup(planInput());

        expect(plan.closePresIds).toEqual([70]);
        expect(plan.closeZprIds).toEqual([80]);
    });

    it('защищённая сделка коллеги, её ХО, задачи и презентации остаются', () => {
        const late = deal(600, COLLEAGUE, '97');
        const lateXo = deal(601, COLLEAGUE, '99', { [LINK]: '600' });
        const plan = planTakeoverCleanup(
            planInput({
                takeover: { ...FORCE, protectedDeals: [late] },
                deals: [TAKEN, late, lateXo],
                tasks: [task(9, COLLEAGUE, ['D_600'])],
                presRows: [
                    { id: 72, assignedById: COLLEAGUE, ufPresDeal: 'D_600' },
                ],
                zprRows: [],
            }),
        );

        expect(plan.closeDeals).toEqual([]);
        expect(plan.completeTaskIds).toEqual([]);
        expect(plan.closePresIds).toEqual([]);
    });

    it('текущая задача отчёта не переносится и не закрывается — её закрывает сам отчёт', () => {
        const plan = planTakeoverCleanup(planInput({ currentTaskId: 1 }));

        expect(plan.reassignTaskIds).toEqual([]);
        expect(plan.completeTaskIds).not.toContain(1);
    });

    it('режим ботов: работа живого коллеги не трогается, только бота', () => {
        const botDeal = deal(215239, BOT, '97');
        const plan = planTakeoverCleanup(
            planInput({
                takeover: {
                    ...FORCE,
                    mode: 'bot',
                    takenDeal: botDeal,
                    duplicateDeals: [],
                },
                deals: [botDeal, TAKEN],
                tasks: [
                    task(5, BOT, ['D_215239']),
                    task(6, COLLEAGUE, ['CO_116533']),
                ],
                presRows: [],
                zprRows: [],
                keepDealIds: new Set([215239]),
            }),
        );

        expect(plan.reassignTaskIds).toEqual([5]);
        expect(plan.completeTaskIds).toEqual([]);
        expect(plan.closeDeals).toEqual([]);
    });
});

const stage = (code: string, bitrixId: string) => ({
    bitrixId,
    code,
    name: code,
    order: 0,
});
const CATEGORIES: Record<string, unknown> = {
    sales_base: {
        bitrixId: 97,
        code: 'sales_base',
        stages: [stage('sales_double', 'APOLOGY')],
    },
    sales_xo: {
        bitrixId: 99,
        code: 'sales_xo',
        stages: [stage('cold_noresult', 'NORESULT')],
    },
    sales_presentation: {
        bitrixId: 101,
        code: 'sales_presentation',
        stages: [stage('spres_noresult', 'NORESULT')],
    },
};
const portal = {
    getDealCategoryByCode: (code: string) => CATEGORIES[code] ?? null,
    getEntityFieldByCode: () => null,
} as unknown as PortalModel;

describe('ClientTakeoverFlowService', () => {
    const setup = () => {
        const commands: string[] = [];
        const updates: Array<{ id: number; fields: Record<string, unknown> }> =
            [];
        const bitrix = {
            batch: {
                task: {
                    update: (cmd: string) => commands.push(cmd),
                    complete: (cmd: string) => commands.push(cmd),
                },
                deal: {
                    update: (
                        cmd: string,
                        id: number,
                        fields: Record<string, unknown>,
                    ) => {
                        commands.push(cmd);
                        updates.push({ id, fields });
                    },
                },
                item: { update: (cmd: string) => commands.push(cmd) },
            },
        } as unknown as BitrixService;
        return {
            flow: new ClientTakeoverFlowService(
                bitrix,
                portal,
                { pres: null, zpr: null },
                true,
            ),
            commands,
            updates,
        };
    };
    const ctx = {
        domain: 'gsr.bitrix24.ru',
        takeover: FORCE,
        company: { ID: '116533', TITLE: 'ООО «Би Хай»' },
        ownerDeal: null,
        currentBaseDeal: TAKEN,
        currentXoDeal: null,
        currentPresDeal: null,
        currentTmcDeal: null,
        currentTask: null,
    } as unknown as EventReportContext;

    beforeEach(() => {
        collected.relations = {
            deals: [TAKEN, ORPHAN, OWN],
            openBaseDeals: [TAKEN, ORPHAN, OWN],
            dealIds: [],
            leadIds: [],
            tasks: [
                task(1, COLLEAGUE, ['D_217611']),
                task(2, COLLEAGUE, ['D_217823']),
            ],
            pres: { info: null, rows: [] },
            zpr: { info: null, rows: [] },
        };
    });

    it('задачи переносятся и закрываются ДО закрытия сделок', async () => {
        const { flow, commands } = setup();

        await flow.read(ctx);
        flow.queue(ctx);

        expect(commands).toEqual([
            'takeover_task_move_1',
            'takeover_task_close_2',
            'takeover_close_217823',
        ]);
    });

    it('чужая основная закрывается «Не состоялась», если «Дубля» на портале нет', async () => {
        const { flow, updates } = setup();

        await flow.read(ctx);
        flow.queue(ctx);

        expect(updates).toEqual([
            { id: 217823, fields: { STAGE_ID: 'C97:APOLOGY' } },
        ]);
    });

    it('сборщик упал — ничего не закрываем вслепую', async () => {
        collected.relations = null;
        const { flow, commands } = setup();

        await flow.read(ctx);
        flow.queue(ctx);

        expect(commands).toEqual([]);
    });

    it('перехвата нет — ни чтений, ни команд', async () => {
        const { flow, commands } = setup();
        const none = {
            ...ctx,
            takeover: null,
        } as unknown as EventReportContext;

        await flow.read(none);
        flow.queue(none);

        expect(commands).toEqual([]);
    });
});
