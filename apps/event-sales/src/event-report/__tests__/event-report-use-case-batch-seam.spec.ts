import { EventReportUseCase } from '../use-cases/event-report.use-case';
import { EventReportPostFlowService } from '../services/post-flow/event-report-post-flow.service';
import {
    ADD_TASK_CMD,
    parseAddedTaskId,
} from '../services/task/event-report-task-flow.service';
import { findBatchResult } from '../../shared/bitrix/prepare-batch-results.util';
import { ColdHookBatchGroupBuffer } from '../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { EEventReportEntityType } from '../services/init/event-report-init.types';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * СТЫК «use-case → координатор сайд-flow»: откуда координатор берёт ответ
 * основного батча.
 *
 * КАКУЮ РЕГРЕССИЮ СТЕРЕЖЁТ ЭТОТ ТЕСТ
 * ----------------------------------
 * cmdBatch у инстанса Битрикса ОДИН на весь endpoint, и `buffer.flush()`
 * отправляет его ЦЕЛИКОМ — вместе с командами, которые flow-сервисы положили
 * напрямую в `bitrix.batch.*` (в том числе `add_task`), — после чего очищает
 * очередь. Поэтому хвостовой `bitrix.api.callBatchWithConcurrency(1)` в
 * use-case'е работает на УЖЕ пустой очереди и возвращает `[]`: единственный
 * ответ с id созданной план-задачи лежит в `buffer.getResults()`.
 *
 * Пока в координатор уезжало `batchResults: results` (только хвостовой вызов),
 * `findBatchResult(..., 'add_task')` не находил ничего НИКОГДА, `planTaskId`
 * был `null`, и плановый элемент смарта уходил в очередь без привязки к
 * задаче. Фича была мертва целиком — при полностью зелёном прогоне.
 *
 * ПОЧЕМУ ОБЫЧНЫЕ СПЕКИ КООРДИНАТОРА ЭТОГО НЕ ЛОВЯТ
 * ------------------------------------------------
 * Спеки `EventReportPostFlowService` вызывают `dispatch()` напрямую и САМИ
 * передают `batchResults` — уже с ответом `add_task` внутри. Они проверяют,
 * что координатор УМЕЕТ прочитать id, но не то, что этот массив вообще кто-то
 * ему приносит. Ровно так же и юнит-тесты `parseAddedTaskId`/`findBatchResult`:
 * оба зелёные на любом входе, потому что вход в них рукотворный. Дыра была
 * не в разборе ответа, а в СБОРКЕ аргумента — то есть ровно в use-case'е,
 * который до этого файла не конструировала ни одна спека в репозитории.
 *
 * ЧТО ИМЕННО ЗАФИКСИРОВАНО
 * ------------------------
 *  1. Буфер здесь НАСТОЯЩИЙ (`ColdHookBatchGroupBuffer`, не мок) — значит
 *     реальны и порядок `endGroup → flush → хвостовой callBatch`, и то, что
 *     первый HTTP-вызов делает именно flush буфера.
 *  2. Фейковый Битрикс отдаёт ответ с `add_task` ПЕРВЫМ вызовом (flush) и
 *     пустой массив ВТОРЫМ (хвост) — как в бою.
 *  3. Проверяется, что в `postFlow.dispatch` приехал непустой `batchResults`
 *     с этим ответом и что `planTaskId` из него извлекается.
 *
 * ПОЧЕМУ КЕЙСОВ ПРО СКЛЕЙКУ ДВА (И ПОЧЕМУ ОДНОГО МАЛО)
 * ----------------------------------------------------
 * `batchResults` склеен из ДВУХ источников — `buffer.getResults()` и
 * хвостового `results`, — и каждый из них в бою бывает ЕДИНСТВЕННЫМ:
 *  • буфер НЕПУСТ (KPI положил команды): `flush()` уносит весь cmdBatch
 *    вместе с `add_task`, хвостовой вызов работает на пустой очереди и
 *    возвращает [] — id приезжает ТОЛЬКО из `buffer.getResults()`;
 *  • буфер ПУСТ — `EventReportKpiFlowService.queue` выходит на
 *    `payloads.length === 0`, а `KpiListFlowService.flowDedup` делает
 *    `continue`, когда KPI-список на портале не установлен: тогда
 *    `buffer.queue` не зовут ни разу, `bufferSize === 0`, `flush()` —
 *    no-op (см. cold-hook-batch-group-buffer: `if (this.bufferSize === 0)
 *    return`), и весь cmdBatch с `add_task` уезжает ХВОСТОВЫМ вызовом —
 *    id приезжает ТОЛЬКО из `results`.
 * Поэтому кейса два, по одному на половину конкатенации: удаление любого из
 * двух источников уронит РОВНО ОДИН из них. Одного теста не хватило бы —
 * например, «упрощение» до одного `buffer.getResults()` (соблазн после
 * комментария «хвостовой вызов почти всегда возвращает []») прошло бы зелёным
 * и молча убило бы фичу на порталах без KPI-списка.
 *
 * Верни в use-case'е `batchResults: results` — падает первый кейс; оставь
 * `batchResults: buffer.getResults()` — падает кейс с пустым буфером. Это и
 * есть их единственная задача.
 *
 * Flow-сервисы замоканы: здесь проверяется НЕ бизнес-логика отчёта (её
 * покрывают соседние спеки), а маршрут ответа батча. Из task-flow сохранены
 * настоящие `ADD_TASK_CMD`/`parseAddedTaskId` — контракт ключа команды и
 * разбора id должен быть тем же, что в бою.
 */

/** Ответ flush'а буфера: тот самый чанк с результатом `tasks.task.add`. */
const PLAN_TASK_ID = 987654;
const flushChunk = (): IBitrixBatchResponseResult =>
    ({
        result: { [ADD_TASK_CMD]: { task: { id: PLAN_TASK_ID } } },
        result_error: [],
        result_total: [],
        result_next: [],
        result_time: [],
    }) as unknown as IBitrixBatchResponseResult;

// --- flow-сервисы: заглушки, чтобы поднять use-case без Битрикса и портала ---

// Заглушки объявлены прямо внутри фабрик `jest.mock`: фабрики поднимаются
// выше объявлений модуля, поэтому общий хелпер в переменной здесь недоступен.

/**
 * Кладёт ли KPI-заглушка команду в буфер: `true` — буфер непуст и весь
 * cmdBatch уносит `flush()`, `false` — буфер пуст, `flush()` no-op и cmdBatch
 * уезжает хвостовым вызовом (портал без установленного KPI-списка).
 *
 * Это ЕДИНСТВЕННОЕ различие между двумя половинами стыка, поэтому переключаем
 * его флагом, а не вторым харнессом. Объект, а не булев примитив: фабрика
 * `jest.mock` поднимается выше объявлений, и читать значение можно только в
 * момент вызова метода — через живую ссылку. Префикс `mock` в имени —
 * требование jest к внешним переменным, доступным из фабрики.
 */
const mockKpiQueuesIntoBuffer = { value: true };

jest.mock('../services/entity/event-report-entity-flow.service', () => ({
    EventReportEntityFlowService: class {
        queue(): void {}
    },
}));
jest.mock('../services/deal/event-report-deal-flow.service', () => ({
    EventReportDealFlowService: class {
        queue(): { baseDealId: null } {
            return { baseDealId: null };
        }
    },
}));
jest.mock('../services/task/event-report-task-flow.service', () => ({
    // Ключ команды и разбор id — настоящие: именно их контракт и проверяем.
    ...jest.requireActual<Record<string, unknown>>(
        '../services/task/event-report-task-flow.service',
    ),
    EventReportTaskFlowService: class {
        readClosingChecklist(): Promise<void> {
            return Promise.resolve();
        }
        queue(): void {}
        notifyTransfer(): Promise<void> {
            return Promise.resolve();
        }
    },
}));
jest.mock('../services/kpi-list/event-report-kpi-flow.service', () => ({
    // KPI — единственный, кто кладёт команды в буфер. Кладёт ли он их в
    // конкретном кейсе, решает mockKpiQueuesIntoBuffer: на боевом портале без
    // установленного KPI-списка настоящий сервис не кладёт ничего.
    EventReportKpiFlowService: class {
        queue(
            _ctx: unknown,
            _deals: unknown,
            buffer: { queue(fn: () => void): void },
        ): Promise<void> {
            if (mockKpiQueuesIntoBuffer.value) {
                buffer.queue(() => {});
            }
            return Promise.resolve();
        }
    },
}));
jest.mock('../services/post-fail/event-report-post-fail.service', () => ({
    EventReportPostFailService: class {
        queue(): void {}
    },
}));
jest.mock('../services/lead/event-report-lead-relation.service', () => ({
    EventReportLeadRelationService: class {
        queue(): void {}
    },
}));
jest.mock('../services/lead/event-report-lead-request-sync.service', () => ({
    EventReportLeadRequestSyncService: class {
        async run(): Promise<void> {}
    },
}));
jest.mock(
    '../services/return-to-tmc/event-report-return-to-tmc.service',
    () => ({
        EventReportReturnToTmcService: class {
            queue(): void {}
        },
    }),
);
jest.mock('../services/history/event-report-entity-history.service', () => ({
    EventReportEntityHistoryService: class {
        queue(): void {}
    },
}));

describe('EventReportUseCase — ответ основного батча доезжает до координатора', () => {
    // Штатный портал: KPI-список установлен, команды в буфер кладутся.
    // Кейс с пустым буфером снимает флаг у себя внутри.
    beforeEach(() => {
        mockKpiQueuesIntoBuffer.value = true;
    });

    // Снимаем шпиона за настоящим буфером (ставит только кейс с пустым
    // буфером), чтобы он не протёк в соседние тесты.
    afterEach(() => {
        jest.restoreAllMocks();
    });

    /**
     * Фейковый Битрикс: первый `callBatchWithConcurrency` (его делает
     * `buffer.flush()`) отдаёт чанк с `add_task`, второй (хвостовой вызов
     * use-case'а) — пустой массив, как на уже опустошённой очереди.
     */
    const makeBitrix = () => {
        const batchCalls: number[] = [];
        return {
            batchCalls,
            bitrix: {
                api: {
                    callBatchWithConcurrency: (
                        concurrency: number,
                    ): Promise<IBitrixBatchResponseResult[]> => {
                        batchCalls.push(concurrency);
                        return Promise.resolve(
                            batchCalls.length === 1 ? [flushChunk()] : [],
                        );
                    },
                },
            },
        };
    };

    const makePortal = () => ({
        getPortal: () => ({ domain: 'portal.bitrix24.ru' }),
        getEntityFieldByCode: () => undefined,
        getFieldBitrixId: () => null,
    });

    const makeInit = () => ({
        entityId: 42,
        entityType: EEventReportEntityType.COMPANY,
    });

    /** Собирает use-case на моках; возвращает его и шпиона за координатором. */
    const makeUseCase = () => {
        const { bitrix, batchCalls } = makeBitrix();
        const portal = makePortal();
        const dispatch = jest.fn<Promise<void>, [Record<string, unknown>]>(() =>
            Promise.resolve(),
        );

        const useCase = new EventReportUseCase(
            {
                init: () => Promise.resolve({ bitrix, PortalModel: portal }),
            } as unknown as ConstructorParameters<typeof EventReportUseCase>[0],
            {
                loadContext: () => Promise.resolve(makeInit()),
            } as unknown as ConstructorParameters<typeof EventReportUseCase>[1],
            {
                resolve: () => Promise.resolve({}),
            } as unknown as ConstructorParameters<typeof EventReportUseCase>[2],
            {
                resolve: () => Promise.resolve({}),
            } as unknown as ConstructorParameters<typeof EventReportUseCase>[3],
            { dispatch } as unknown as EventReportPostFlowService,
        );

        return { useCase, dispatch, batchCalls };
    };

    const dto = {
        domain: 'portal.bitrix24.ru',
        operationId: 'op-1',
    } as unknown as Parameters<EventReportUseCase['execute']>[0];

    it("в координатор уезжает ответ flush'а буфера, а не пустой хвостовой вызов", async () => {
        const { useCase, dispatch, batchCalls } = makeUseCase();

        await useCase.execute(dto, 'socket-1');

        // Два HTTP-batch: flush буфера и хвостовой вызов use-case'а.
        expect(batchCalls).toHaveLength(2);
        expect(dispatch).toHaveBeenCalledTimes(1);

        const input = dispatch.mock.calls[0][0];
        const batchResults = input.batchResults as IBitrixBatchResponseResult[];
        // Регрессия: было `batchResults: results` → приезжал пустой массив.
        expect(batchResults).toHaveLength(1);
        expect(findBatchResult(batchResults, ADD_TASK_CMD)).toEqual({
            task: { id: PLAN_TASK_ID },
        });
    });

    it('planTaskId извлекается из того, что приехало в координатор', async () => {
        const { useCase, dispatch } = makeUseCase();

        await useCase.execute(dto);

        const batchResults = dispatch.mock.calls[0][0]
            .batchResults as IBitrixBatchResponseResult[];
        expect(
            parseAddedTaskId(findBatchResult(batchResults, ADD_TASK_CMD)),
        ).toBe(PLAN_TASK_ID);
    });

    /**
     * Вторая половина конкатенации: буфер ПУСТ.
     *
     * На портале без установленного KPI-списка `buffer.queue` не зовут ни
     * разу: `bufferSize` остаётся 0, `endGroup()` выходит на пустой группе,
     * `flush()` — no-op, и весь cmdBatch (вместе с `add_task`) уходит РОВНО
     * ОДНИМ, хвостовым `callBatchWithConcurrency`. Здесь `buffer.getResults()`
     * пуст, и единственный источник id — `results`.
     *
     * В паре с кейсом выше это и есть страховка от «упрощения» склейки:
     * оставить один `buffer.getResults()` — падает этот тест, оставить один
     * `results` — падает тот.
     */
    it('буфер пуст: id план-задачи приезжает из хвостового вызова (портал без KPI-списка)', async () => {
        mockKpiQueuesIntoBuffer.value = false;
        // Шпион за НАСТОЯЩИМ буфером: доказываем, что в него действительно
        // ничего не положили, а не просто получили удобное число вызовов.
        const bufferQueueSpy = jest.spyOn(
            ColdHookBatchGroupBuffer.prototype,
            'queue',
        );
        // Шпион БЕЗ подмены поведения: нужен не для мока, а чтобы зафиксировать
        // фактически возвращённое значение — именно оно осталось бы от
        // «упрощённой» склейки.
        const bufferResultsSpy = jest.spyOn(
            ColdHookBatchGroupBuffer.prototype,
            'getResults',
        );

        const { useCase, dispatch, batchCalls } = makeUseCase();

        await useCase.execute(dto, 'socket-2');

        expect(bufferQueueSpy).not.toHaveBeenCalled();
        // Буфер отдал пустоту на КАЖДЫЙ вызов: значит всё, что доехало до
        // координатора, пришло из хвостового `results` и ниоткуда больше.
        expect(bufferResultsSpy).toHaveBeenCalled();
        for (const call of bufferResultsSpy.mock.results) {
            expect(call.value).toEqual([]);
        }
        // Ровно один HTTP-batch: flush оказался no-op, отправил хвостовой вызов.
        expect(batchCalls).toHaveLength(1);
        expect(dispatch).toHaveBeenCalledTimes(1);

        const batchResults = dispatch.mock.calls[0][0]
            .batchResults as IBitrixBatchResponseResult[];
        // Регрессия: `batchResults: buffer.getResults()` → приехал бы пустой
        // массив и planTaskId снова стал бы null — молча, только на порталах
        // без KPI-списка.
        expect(batchResults).toHaveLength(1);
        expect(
            parseAddedTaskId(findBatchResult(batchResults, ADD_TASK_CMD)),
        ).toBe(PLAN_TASK_ID);
    });
});

/**
 * Тот же стык, но на голом контракте буфера — без use-case'а: страховка на
 * случай, если сборку use-case'а когда-нибудь переразложат по другим файлам.
 * Порядок вызовов здесь настоящий, буфер настоящий.
 */
describe("ColdHookBatchGroupBuffer — ответ flush'а не виден хвостовому вызову", () => {
    it('flush забирает весь cmdBatch: id план-задачи есть только в getResults()', async () => {
        let call = 0;
        const bitrix = {
            api: {
                callBatchWithConcurrency: (): Promise<
                    IBitrixBatchResponseResult[]
                > => Promise.resolve(++call === 1 ? [flushChunk()] : []),
            },
        };
        const buffer = new ColdHookBatchGroupBuffer(
            bitrix as unknown as ConstructorParameters<
                typeof ColdHookBatchGroupBuffer
            >[0],
        );

        buffer.queue(() => {});
        await buffer.endGroup();
        await buffer.flush();
        const tail = await bitrix.api.callBatchWithConcurrency();

        // Хвостовой вызов пуст — брать только его значило бы потерять id.
        expect(tail).toEqual([]);
        expect(
            parseAddedTaskId(findBatchResult(tail, ADD_TASK_CMD)),
        ).toBeNull();
        expect(
            parseAddedTaskId(
                findBatchResult(buffer.getResults(), ADD_TASK_CMD),
            ),
        ).toBe(PLAN_TASK_ID);
    });
});
