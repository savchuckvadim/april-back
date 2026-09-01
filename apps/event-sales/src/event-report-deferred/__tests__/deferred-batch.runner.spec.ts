import { DeferredBatchRunner } from '../services/deferred-batch.runner';
import { EnumDeferredFlowStepKind } from '../dto/event-report-deferred.dto';
import { EventReportContext } from '../../event-report/services/context/event-report.context';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * Батчевая часть досылки: КАКОЙ сервис исполняет какой вид шага и что
 * попадает (а что НЕ попадает) в батч.
 *
 * Доменные flow-сервисы замоканы: здесь проверяется не бизнес-логика
 * движений сделок (её покрывают спеки самих сервисов), а раскрой шагов по
 * исполнителям, изоляция падений и — главное — отсутствие команд ЯДРА:
 * карточку клиента, задачу и историю в этой ручке уже исполнил браузер, и
 * их повтор был бы вторым отчётом по одному событию.
 */

/** Что каждый мок положил в батч — по этому списку судим о раскрое. */
const queued: string[] = [];

jest.mock(
    '../../event-report/services/deal/event-report-deal-flow.service',
    () => ({
        EventReportDealFlowService: class {
            constructor(
                private readonly bitrix: {
                    batch: { deal: { update(cmd: string): void } };
                },
            ) {}
            queue(): Record<string, string | null> {
                // Композит: база + презентация + ХО + ТМЦ одной связкой.
                this.bitrix.batch.deal.update('update_base_deal_10');
                this.bitrix.batch.deal.update('update_pres_deal_11');
                this.bitrix.batch.deal.update('update_xo_deal_12');
                return {
                    baseDealId: '10',
                    newPlanPresDealId: '$result[set_pres_deal]',
                    newUnplannedPresDealId: null,
                };
            }
        },
    }),
);
jest.mock(
    '../../event-report/services/deal/sales-presentation-deal.service',
    () => ({
        SalesPresentationDealService: class {
            constructor(
                private readonly bitrix: {
                    batch: { deal: { update(cmd: string): void } };
                },
            ) {}
            queue(_ctx: unknown, baseDealId: string | null) {
                queued.push(`pres-only:${String(baseDealId)}`);
                this.bitrix.batch.deal.update('update_pres_deal_11');
                return {
                    newPlanPresDealId: null,
                    newUnplannedPresDealId: null,
                };
            }
        },
    }),
);
jest.mock('../../event-report/services/deal/sales-xo-deal.service', () => ({
    SalesXoDealService: class {
        constructor(
            private readonly bitrix: {
                batch: { deal: { update(cmd: string): void } };
            },
        ) {}
        queue(): void {
            queued.push('xo-only');
            this.bitrix.batch.deal.update('update_xo_deal_12');
        }
    },
}));
jest.mock(
    '../../event-report/services/kpi-list/event-report-kpi-flow.service',
    () => ({
        EventReportKpiFlowService: class {
            constructor(
                private readonly bitrix: {
                    batch: { listItem: { add(cmd: string): void } };
                },
            ) {}
            queue(
                _ctx: unknown,
                _deals: unknown,
                buffer: { queue(fn: () => void): void },
            ): Promise<unknown[]> {
                queued.push('kpi');
                buffer.queue(() =>
                    this.bitrix.batch.listItem.add('add_list_item_kpi_1'),
                );
                return Promise.resolve([]);
            }
        },
    }),
);

/** Фейковый Битрикс: пишет ключи команд и отдаёт заданный ответ батча. */
const makeBitrix = (chunk?: IBitrixBatchResponseResult) => {
    const commands: string[] = [];
    const record =
        (prefix: string) =>
        (cmd: string): void => {
            commands.push(`${prefix}:${cmd}`);
        };
    const batch = {
        deal: { update: record('deal.update'), set: record('deal.set') },
        company: { update: record('company.update') },
        lead: { update: record('lead.update') },
        task: {
            add: record('task.add'),
            update: record('task.update'),
            complete: record('task.complete'),
            commentAdd: record('task.commentAdd'),
        },
        timeline: { addTimelineComment: record('timeline.comment') },
        listItem: { add: record('listItem.add') },
    };
    const calls: number[] = [];

    return {
        commands,
        calls,
        bitrix: {
            batch,
            api: {
                callBatchWithConcurrency: (
                    concurrency: number,
                ): Promise<IBitrixBatchResponseResult[]> => {
                    calls.push(concurrency);
                    return Promise.resolve(chunk ? [chunk] : []);
                },
            },
        } as unknown as BitrixService,
    };
};

const okChunk = (): IBitrixBatchResponseResult =>
    ({
        result: { update_pres_deal_11: true, add_list_item_kpi_1: 5 },
        result_error: [],
        result_total: [],
        result_next: [],
    }) as unknown as IBitrixBatchResponseResult;

const deniedChunk = (cmd: string): IBitrixBatchResponseResult =>
    ({
        result: { update_pres_deal_11: true },
        result_error: {
            [cmd]: {
                error: 'ACCESS_DENIED',
                error_description: 'Access denied',
            },
        },
        result_total: [],
        result_next: [],
    }) as unknown as IBitrixBatchResponseResult;

const makeCtx = (overrides: Record<string, unknown> = {}) =>
    ({
        domain: 'portal.bitrix24.ru',
        isDealFlow: true,
        currentBaseDeal: { ID: '10' },
        ...overrides,
    }) as unknown as EventReportContext;

const portal = {} as unknown as PortalModel;

describe('DeferredBatchRunner — раскрой батчевых шагов по исполнителям', () => {
    beforeEach(() => {
        queued.length = 0;
    });

    it('пустой набор видов — в Битрикс не ходим вовсе', async () => {
        const { bitrix, calls } = makeBitrix();

        const outcome = await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set(),
        );

        expect(calls).toHaveLength(0);
        expect(outcome.commandsCount).toBe(0);
        expect(outcome.failures.size).toBe(0);
    });

    it('оба вида сделок — весь deal-композит одним сервисом ($result-чейнинг цел)', async () => {
        const { bitrix, commands } = makeBitrix(okChunk());

        const outcome = await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set([
                EnumDeferredFlowStepKind.presDeals,
                EnumDeferredFlowStepKind.xoDeals,
            ]),
        );

        expect(commands).toEqual([
            'deal.update:update_base_deal_10',
            'deal.update:update_pres_deal_11',
            'deal.update:update_xo_deal_12',
        ]);
        // Одиночные сервисы воронок не звались — композит неделим.
        expect(queued).toEqual([]);
        expect(outcome.deals.baseDealId).toBe('10');
        expect(outcome.failures.size).toBe(0);
    });

    it('только «ХО» (тонкий раскрой) — работает сервис своей воронки, композит не трогаем', async () => {
        const { bitrix, commands } = makeBitrix(okChunk());

        await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set([EnumDeferredFlowStepKind.xoDeals]),
        );

        expect(queued).toEqual(['xo-only']);
        expect(commands).toEqual(['deal.update:update_xo_deal_12']);
    });

    it('только «Презентации» — базовая сделка берётся из контекста реальным id', async () => {
        const { bitrix } = makeBitrix(okChunk());

        await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set([EnumDeferredFlowStepKind.presDeals]),
        );

        expect(queued).toEqual(['pres-only:10']);
    });

    it('KPI исполняется своим сервисом через групповой буфер', async () => {
        const { bitrix, commands, calls } = makeBitrix(okChunk());

        const outcome = await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set([EnumDeferredFlowStepKind.kpi]),
        );

        expect(queued).toEqual(['kpi']);
        expect(commands).toEqual(['listItem.add:add_list_item_kpi_1']);
        // flush буфера + хвостовой вызов: ответ склеивается из ОБОИХ
        // источников (фейк отдаёт свой чанк каждому — отсюда 2×2 команды).
        expect(calls).toEqual([1, 1]);
        expect(outcome.batchResults).toHaveLength(2);
        expect(outcome.commandsCount).toBe(4);
    });

    it('ЯДРО не исполняется: ни карточки, ни задачи, ни истории в батче', async () => {
        const { bitrix, commands } = makeBitrix(okChunk());

        await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set([
                EnumDeferredFlowStepKind.presDeals,
                EnumDeferredFlowStepKind.xoDeals,
                EnumDeferredFlowStepKind.kpi,
            ]),
        );

        expect(
            commands.filter(
                cmd =>
                    cmd.startsWith('company.') ||
                    cmd.startsWith('lead.') ||
                    cmd.startsWith('task.') ||
                    cmd.startsWith('timeline.'),
            ),
        ).toEqual([]);
    });

    it('ACCESS_DENIED на команде «ХО» валит только этот шаг — KPI и «Презентации» исполнены', async () => {
        const { bitrix } = makeBitrix(deniedChunk('update_xo_deal_12'));

        const outcome = await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set([
                EnumDeferredFlowStepKind.presDeals,
                EnumDeferredFlowStepKind.xoDeals,
                EnumDeferredFlowStepKind.kpi,
            ]),
        );

        expect([...outcome.failures.keys()]).toEqual([
            EnumDeferredFlowStepKind.xoDeals,
        ]);
        expect(
            outcome.failures.get(EnumDeferredFlowStepKind.xoDeals),
        ).toContain('ACCESS_DENIED');
    });

    it('упавший HTTP батча помечает все батчевые шаги, ответ не теряется', async () => {
        const { bitrix } = makeBitrix();
        (
            bitrix as unknown as {
                api: { callBatchWithConcurrency: () => Promise<never> };
            }
        ).api.callBatchWithConcurrency = () =>
            Promise.reject(new Error('битрикс недоступен'));

        const outcome = await new DeferredBatchRunner(bitrix, portal).run(
            makeCtx(),
            new Set([
                EnumDeferredFlowStepKind.presDeals,
                EnumDeferredFlowStepKind.xoDeals,
            ]),
        );

        expect([...outcome.failures.keys()].sort()).toEqual([
            EnumDeferredFlowStepKind.presDeals,
            EnumDeferredFlowStepKind.xoDeals,
        ]);
        expect(outcome.commandsCount).toBe(0);
    });
});
