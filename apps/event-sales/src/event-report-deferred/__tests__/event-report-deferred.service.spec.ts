import { BadRequestException } from '@nestjs/common';
import { EventReportDeferredService } from '../services/event-report-deferred.service';
import { DeferredFlowContextFactory } from '../services/deferred-flow-context.factory';
import { DeferredStepDedupStore } from '../services/deferred-step-dedup.store';
import { DeferredSideFlowDispatcher } from '../services/deferred-side-flow.dispatcher';
import { QuestionnaireSmartContextLoader } from '../../event-report/services/post-flow/questionnaire-smart-context.loader';
import {
    EnumDeferredFlowStepKind,
    EnumDeferredSideFlow,
    EnumDeferredStepStatus,
    EventReportDeferredRequestDto,
} from '../dto/event-report-deferred.dto';
import { EventSalesFlowDto } from '../../event-report/dto/event-sale-flow/event-sales-flow.dto';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * Оркестратор досылки хвоста: КТО исполняет каждый вид шага, что происходит
 * при повторе операции, при падении одного шага — и чего ручка не делает
 * НИКОГДА (ядро отчёта).
 *
 * Батчевые сервисы (сделки/KPI), синк заявок и уведомление о переносе
 * замоканы: их собственная логика покрыта своими спеками, здесь важен
 * маршрут «шаг → исполнитель → исход в ответе».
 */

/** Что позвал оркестратор — по этому следу судим о раскрое по исполнителям. */
const called: string[] = [];
/** Входы, с которыми звали постановку сайд-джобов. */
const sideFlowInputs: Array<Record<string, unknown>> = [];
/** Команды, попавшие в батч: ядра тут быть не должно ни при каких шагах. */
const commands: string[] = [];
/** Управление падениями моков из конкретного кейса. */
const failures = {
    deals: false,
    leadSync: false,
    transferNotify: false,
};

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
                called.push('deal-flow');
                if (failures.deals) throw new Error('воронки недоступны');
                this.bitrix.batch.deal.update('update_pres_deal_11');
                return {
                    baseDealId: '10',
                    newPlanPresDealId: null,
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
            queue() {
                called.push('pres-deal');
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
        queue(): void {
            called.push('xo-deal');
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
                called.push('kpi-flow');
                buffer.queue(() =>
                    this.bitrix.batch.listItem.add('add_list_item_kpi_1'),
                );
                return Promise.resolve([]);
            }
        },
    }),
);
jest.mock(
    '../../event-report/services/lead/event-report-lead-request-sync.service',
    () => ({
        EventReportLeadRequestSyncService: class {
            run(): Promise<{ synced: number; warnings: string[] }> {
                called.push('lead-request-sync');
                if (failures.leadSync) {
                    return Promise.reject(new Error('лиды не прочитались'));
                }
                return Promise.resolve({ synced: 2, warnings: [] });
            }
        },
    }),
);
jest.mock(
    '../../event-report/services/task/event-report-task-flow.service',
    () => ({
        ...jest.requireActual<Record<string, unknown>>(
            '../../event-report/services/task/event-report-task-flow.service',
        ),
        EventReportTaskFlowService: class {
            notifyTransfer(): Promise<void> {
                called.push('transfer-notify');
                return failures.transferNotify
                    ? Promise.reject(new Error('im недоступен'))
                    : Promise.resolve();
            }
            // Ядро задачи: если оркестратор когда-нибудь его позовёт — тест
            // это увидит по следу, а не по молчаливо созданной задаче.
            queue(): void {
                called.push('task-flow.queue');
            }
            readClosingChecklist(): Promise<void> {
                called.push('task-flow.readClosingChecklist');
                return Promise.resolve();
            }
        },
    }),
);

const chunk = (): IBitrixBatchResponseResult =>
    ({
        result: { update_pres_deal_11: true },
        result_error: [],
        result_total: [],
        result_next: [],
    }) as unknown as IBitrixBatchResponseResult;

/** Фейковый Битрикс: пишет ключи команд всех доменов, включая ядро. */
const makeBitrix = () => {
    const record =
        (prefix: string) =>
        (cmd: string): void => {
            commands.push(`${prefix}:${cmd}`);
        };
    return {
        batch: {
            deal: { update: record('deal.update'), set: record('deal.set') },
            company: { update: record('company.update') },
            lead: { update: record('lead.update') },
            task: {
                add: record('task.add'),
                complete: record('task.complete'),
                commentAdd: record('task.commentAdd'),
            },
            timeline: { addTimelineComment: record('timeline.comment') },
            listItem: { add: record('listItem.add') },
        },
        api: {
            callBatchWithConcurrency: (): Promise<
                IBitrixBatchResponseResult[]
            > => Promise.resolve([chunk()]),
        },
    };
};

const OPERATION_ID = 'op-deferred-1';
const DOMAIN = 'portal.bitrix24.ru';

const payload = (): EventSalesFlowDto =>
    ({
        domain: DOMAIN,
        operationId: OPERATION_ID,
    }) as unknown as EventSalesFlowDto;

const request = (
    steps: EventReportDeferredRequestDto['steps'],
): EventReportDeferredRequestDto =>
    ({
        domain: DOMAIN,
        operationId: OPERATION_ID,
        steps,
        payload: payload(),
    }) as EventReportDeferredRequestDto;

/** Харнесс: сервис на моках + доступ к шпионам дедупа и сайд-очередей. */
const makeService = (options: { reserved?: boolean } = {}) => {
    const reserve = jest.fn(() => Promise.resolve(options.reserved ?? true));
    const release = jest.fn(() => Promise.resolve());
    const dispatchSideFlow = jest.fn(
        (flow: string, input: Record<string, unknown>) => {
            called.push(`side-flow:${flow}`);
            sideFlowInputs.push(input);
            return Promise.resolve(1);
        },
    );
    const build = jest.fn(() =>
        Promise.resolve({
            bitrix: makeBitrix(),
            portal: {},
            ctx: {
                domain: DOMAIN,
                isDealFlow: true,
                currentBaseDeal: { ID: '10' },
                dto: payload(),
            },
        }),
    );

    const service = new EventReportDeferredService(
        {
            build,
            leadLinkDefinitions: () => Promise.resolve({}),
        } as unknown as DeferredFlowContextFactory,
        { reserve, release } as unknown as DeferredStepDedupStore,
        {
            dispatch: dispatchSideFlow,
        } as unknown as DeferredSideFlowDispatcher,
        {
            loadQuestionnaireSmartContext: () => Promise.resolve(null),
        } as unknown as QuestionnaireSmartContextLoader,
    );

    return { service, reserve, release, dispatchSideFlow, build };
};

describe('EventReportDeferredService — досылка хвоста', () => {
    beforeEach(() => {
        called.length = 0;
        commands.length = 0;
        sideFlowInputs.length = 0;
        failures.deals = false;
        failures.leadSync = false;
        failures.transferNotify = false;
    });

    it('каждый вид шага исполняется своим сервисом', async () => {
        const { service } = makeService();

        const result = await service.execute(
            request([
                { kind: EnumDeferredFlowStepKind.kpi },
                { kind: EnumDeferredFlowStepKind.presDeals },
                { kind: EnumDeferredFlowStepKind.xoDeals },
                { kind: EnumDeferredFlowStepKind.leadRequestSync },
                { kind: EnumDeferredFlowStepKind.transferNotify },
                {
                    kind: EnumDeferredFlowStepKind.sideFlow,
                    flow: EnumDeferredSideFlow.zpr,
                    addedTaskId: 777,
                    createdPresDealId: null,
                },
                {
                    kind: EnumDeferredFlowStepKind.sideFlow,
                    flow: EnumDeferredSideFlow.pres,
                    addedTaskId: 777,
                    createdPresDealId: 1024,
                },
            ]),
        );

        expect(called).toEqual([
            'deal-flow',
            'kpi-flow',
            'lead-request-sync',
            'transfer-notify',
            'side-flow:zpr',
            'side-flow:pres',
        ]);
        expect(result.completed).toBe(true);
        expect(result.pending).toEqual([]);
        expect(result.steps.map(step => step.status)).toEqual(
            Array(7).fill(EnumDeferredStepStatus.executed),
        );
        // id план-задачи и созданной pres-сделки доезжают из шага — сервер
        // задач не создаёт и взять их больше неоткуда.
        expect(sideFlowInputs[1]).toMatchObject({
            planTaskId: 777,
            createdPresDealId: 1024,
        });
    });

    it('ядро отчёта не исполняется: ни карточки, ни задачи, ни истории', async () => {
        const { service } = makeService();

        await service.execute(
            request([
                { kind: EnumDeferredFlowStepKind.kpi },
                { kind: EnumDeferredFlowStepKind.presDeals },
                { kind: EnumDeferredFlowStepKind.xoDeals },
                { kind: EnumDeferredFlowStepKind.transferNotify },
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
        expect(called).not.toContain('task-flow.queue');
        expect(called).not.toContain('task-flow.readClosingChecklist');
    });

    it('повтор операции: шаг с занятой отметкой не исполняется второй раз', async () => {
        const { service, build } = makeService({ reserved: false });

        const result = await service.execute(
            request([
                { kind: EnumDeferredFlowStepKind.kpi },
                {
                    kind: EnumDeferredFlowStepKind.sideFlow,
                    flow: EnumDeferredSideFlow.pres,
                },
            ]),
        );

        // Ни одного похода в Битрикс: исполнять нечего.
        expect(build).not.toHaveBeenCalled();
        expect(called).toEqual([]);
        expect(result.steps.map(step => step.status)).toEqual([
            EnumDeferredStepStatus.duplicate,
            EnumDeferredStepStatus.duplicate,
        ]);
        expect(result.completed).toBe(true);
    });

    it('дубль ВНУТРИ одного запроса исполняется один раз', async () => {
        const { service } = makeService();

        const result = await service.execute(
            request([
                { kind: EnumDeferredFlowStepKind.kpi },
                { kind: EnumDeferredFlowStepKind.kpi },
            ]),
        );

        expect(called.filter(name => name === 'kpi-flow')).toHaveLength(1);
        expect(result.steps.map(step => step.status)).toEqual([
            EnumDeferredStepStatus.executed,
            EnumDeferredStepStatus.duplicate,
        ]);
    });

    it('один упавший шаг не мешает остальным и виден в ответе', async () => {
        failures.leadSync = true;
        const { service, release } = makeService();

        const result = await service.execute(
            request([
                { kind: EnumDeferredFlowStepKind.kpi },
                { kind: EnumDeferredFlowStepKind.leadRequestSync },
                {
                    kind: EnumDeferredFlowStepKind.sideFlow,
                    flow: EnumDeferredSideFlow.zpr,
                },
            ]),
        );

        expect(result.steps.map(step => step.status)).toEqual([
            EnumDeferredStepStatus.executed,
            EnumDeferredStepStatus.failed,
            EnumDeferredStepStatus.executed,
        ]);
        expect(result.steps[1].detail).toContain('лиды не прочитались');
        expect(result.completed).toBe(false);
        expect(result.pending).toEqual([
            EnumDeferredFlowStepKind.leadRequestSync,
        ]);
        // Отметка упавшего шага снята — фронт вправе повторить именно его.
        expect(release).toHaveBeenCalledWith(
            DOMAIN,
            OPERATION_ID,
            EnumDeferredFlowStepKind.leadRequestSync,
        );
    });

    it('упавшая сборка движений сделок валит только свою пару шагов', async () => {
        failures.deals = true;
        const { service } = makeService();

        const result = await service.execute(
            request([
                { kind: EnumDeferredFlowStepKind.presDeals },
                { kind: EnumDeferredFlowStepKind.xoDeals },
                { kind: EnumDeferredFlowStepKind.transferNotify },
            ]),
        );

        expect(result.steps.map(step => step.status)).toEqual([
            EnumDeferredStepStatus.failed,
            EnumDeferredStepStatus.failed,
            EnumDeferredStepStatus.executed,
        ]);
        expect(result.steps[0].detail).toContain('воронки недоступны');
    });

    it('не собрался контекст — не исполнено ничего, отметки сняты', async () => {
        const { service, release } = makeService();
        (
            service as unknown as {
                contextFactory: { build: jest.Mock };
            }
        ).contextFactory.build.mockRejectedValueOnce(
            new Error('портал не найден'),
        );

        const result = await service.execute(
            request([
                { kind: EnumDeferredFlowStepKind.kpi },
                { kind: EnumDeferredFlowStepKind.transferNotify },
            ]),
        );

        expect(called).toEqual([]);
        expect(result.completed).toBe(false);
        expect(result.pending).toEqual([
            EnumDeferredFlowStepKind.kpi,
            EnumDeferredFlowStepKind.transferNotify,
        ]);
        expect(release).toHaveBeenCalledTimes(2);
    });

    it('side-flow без потока — 400: неизвестно, в какой смарт досылать', async () => {
        const { service } = makeService();

        await expect(
            service.execute(
                request([{ kind: EnumDeferredFlowStepKind.sideFlow }]),
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('расхождение operationId запроса и payload попадает в warnings', async () => {
        const { service } = makeService();
        const dto = request([{ kind: EnumDeferredFlowStepKind.kpi }]);
        dto.payload.operationId = 'op-other';

        const result = await service.execute(dto);

        expect(result.warnings.join(' ')).toContain('op-other');
    });
});
