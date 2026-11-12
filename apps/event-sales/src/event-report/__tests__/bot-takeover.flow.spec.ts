import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../services/context/event-report.context';
import { BotTakeoverFlowService } from '../services/deal/bot-takeover.flow';
import { BotTakeover } from '../services/init/bot-takeover';

/**
 * Перехват у ботов обзвона: задачи ботов закрываются ДО сделок (сделка в
 * финале сама закрывает свои дела — наш complete после неё дал бы ошибку),
 * лишние сделки ботов — в стадию закрытия своей воронки, в ленту — кто и где
 * теперь ведёт клиента.
 */
const BOT = 643;
const MANAGER = 557;

const deal = (id: number, category: string): IBXDeal =>
    ({
        ID: String(id),
        ASSIGNED_BY_ID: String(BOT),
        CATEGORY_ID: category,
    }) as unknown as IBXDeal;

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
};

const portal = {
    getDealCategoryByCode: (code: string) => CATEGORIES[code] ?? null,
} as unknown as PortalModel;

const setup = (tasks: { id: string; responsibleId: string }[]) => {
    const commands: string[] = [];
    const updates: Array<{ id: number; fields: Record<string, unknown> }> = [];
    const comments: Array<{ ENTITY_ID: number; COMMENT: string }> = [];
    const taskFilters: Record<string, unknown>[] = [];
    const bitrix = {
        task: {
            getList: (filter: Record<string, unknown>) => {
                taskFilters.push(filter);
                return Promise.resolve({ result: { tasks } });
            },
        },
        batch: {
            task: {
                complete: (cmd: string) => {
                    commands.push(cmd);
                },
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
        },
        timeline: {
            addTimelineComment: (fields: {
                ENTITY_ID: number;
                COMMENT: string;
            }) => {
                comments.push(fields);
                return Promise.resolve();
            },
        },
        user: {
            get: ({ ID }: { ID: number }) =>
                Promise.resolve({
                    result: [
                        ID === BOT
                            ? { ID, NAME: 'Бот', LAST_NAME: 'Манго' }
                            : { ID, NAME: 'Надежда', LAST_NAME: 'Тишкова' },
                    ],
                }),
        },
    } as unknown as BitrixService;
    return {
        flow: new BotTakeoverFlowService(bitrix, portal),
        commands,
        updates,
        comments,
        taskFilters,
    };
};

const TAKEN = deal(217605, '97');
const DUPLICATE = deal(215223, '97');
const DUPLICATE_XO = deal(215225, '99');

const ctx = (takeover: BotTakeover | null, currentTaskId?: number) =>
    ({
        domain: 'gsr.bitrix24.ru',
        botTakeover: takeover,
        currentBaseDeal: takeover?.takenDeal ?? null,
        currentTask: currentTaskId ? { id: currentTaskId } : null,
        workResponsibleId: MANAGER,
    }) as unknown as EventReportContext;

const TAKEOVER: BotTakeover = {
    takenDeal: TAKEN,
    duplicateDeals: [DUPLICATE],
    duplicateXoDeals: [DUPLICATE_XO],
    botOwnerIds: [BOT],
};

describe('BotTakeoverFlowService', () => {
    it('закрывает только задачи ботов, кроме текущей (её закрывает сам отчёт)', async () => {
        const { flow, commands, taskFilters } = setup([
            { id: '352243', responsibleId: String(BOT) },
            { id: '356815', responsibleId: String(MANAGER) },
            { id: '360000', responsibleId: String(BOT) },
        ]);

        await flow.readBotTasks(ctx(TAKEOVER, 360000));
        flow.queue(ctx(TAKEOVER, 360000));

        expect(taskFilters[0].UF_CRM_TASK).toEqual([
            'D_217605',
            'D_215223',
            'D_215225',
        ]);
        expect(commands).toContain('bot_takeover_task_352243');
        expect(commands).not.toContain('bot_takeover_task_356815');
        expect(commands).not.toContain('bot_takeover_task_360000');
    });

    it('задачи закрываются раньше, чем сделки уходят в финал', async () => {
        const { flow, commands } = setup([
            { id: '352243', responsibleId: String(BOT) },
        ]);

        await flow.readBotTasks(ctx(TAKEOVER));
        flow.queue(ctx(TAKEOVER));

        expect(commands.indexOf('bot_takeover_task_352243')).toBeLessThan(
            commands.indexOf('bot_takeover_close_215223'),
        );
    });

    it('дубль основной — «Не состоялась», дубль ХО — «без результата»; забранную не трогает', async () => {
        const { flow, updates } = setup([]);

        await flow.readBotTasks(ctx(TAKEOVER));
        flow.queue(ctx(TAKEOVER));

        expect(updates).toEqual([
            { id: 215223, fields: { STAGE_ID: 'C97:APOLOGY' } },
            { id: 215225, fields: { STAGE_ID: 'C99:NORESULT' } },
        ]);
    });

    it('в ленте: забранная — от кого к кому, дубль — где теперь ведут клиента', async () => {
        const { flow, comments } = setup([]);

        await flow.notify(ctx(TAKEOVER));

        expect(comments.map(c => c.ENTITY_ID)).toEqual([217605, 215223]);
        expect(comments[0].COMMENT).toContain('Бот Манго');
        expect(comments[0].COMMENT).toContain('Надежда Тишкова');
        expect(comments[1].COMMENT).toContain('Дубль');
        expect(comments[1].COMMENT).toContain('217605');
    });

    it('перехвата нет — ничего не читает и не пишет', async () => {
        const { flow, commands, comments, taskFilters } = setup([]);

        await flow.readBotTasks(ctx(null));
        flow.queue(ctx(null));
        await flow.notify(ctx(null));

        expect(taskFilters).toEqual([]);
        expect(commands).toEqual([]);
        expect(comments).toEqual([]);
    });
});
