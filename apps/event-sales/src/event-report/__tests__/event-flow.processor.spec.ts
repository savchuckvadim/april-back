import { Job } from 'bull';
import { WsService } from '@/core/ws';
import { QueueConcurrencyService } from '@/modules/queue/concurrency/queue-concurrency.service';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { EventFlowJobData } from '../dto/event-flow-job.dto';
import {
    EnumEventFlowStatus,
    EventFlowOperationDto,
} from '../dto/response/event-flow-operation.dto';
import { EventFlowProcessor } from '../queue/event-flow.processor';
import { EventFlowDuplicateGuardService } from '../services/flow-guard/event-flow-duplicate-guard.service';
import { EventFlowStatusService } from '../services/status/event-flow-status.service';
import { EventReportUseCase } from '../use-cases/event-report.use-case';
import { EventReportTmcUseCase } from '../../event-report-tmc/use-cases/event-report-tmc.use-case';

/**
 * Воркер отчёта и слот очереди.
 *
 * Главное здесь — ПОВТОРНАЯ ДОСТАВКА ПОСЛЕ ВЫКЛАДКИ. Перезапуск обрывает
 * отчёт посреди работы, Bull отдаёт тот же джоб заново, а лок клиента от
 * оборванной доставки ещё лежит в Redis. Воркер обязан назвать слоту id
 * операции — только по нему лок опознаётся как свой и забирается сразу.
 * Без этого отчёт перекладывался 7,5 минуты и падал с «очередь перегружена».
 */
const OPERATION_ID = 'op-1';
const DOMAIN = 'a.bitrix24.ru';

const makeOperation = (status: EnumEventFlowStatus): EventFlowOperationDto =>
    ({
        operationId: OPERATION_ID,
        status,
        queuedAt: '2026-11-23T13:54:18.000Z',
    }) as EventFlowOperationDto;

const makeJob = (slotRetries?: number) => {
    const add = jest.fn().mockResolvedValue(undefined);
    const data: EventFlowJobData = {
        operationId: OPERATION_ID,
        domain: DOMAIN,
        dto: {
            domain: DOMAIN,
            context: { companyId: 77771, dealId: 210439 },
        } as EventFlowJobData['dto'],
        slotRetries,
    };
    const job = {
        id: 1,
        timestamp: Date.now(),
        data,
        queue: { add },
    } as unknown as Job<EventFlowJobData>;
    return { job, add };
};

const makeHarness = (over: {
    status: EnumEventFlowStatus;
    acquired: boolean;
}) => {
    const release = jest.fn().mockResolvedValue(undefined);
    const acquire = jest.fn().mockResolvedValue({
        acquired: over.acquired,
        reason: over.acquired ? undefined : 'entity-busy',
        release,
    });
    const execute = jest.fn().mockResolvedValue({ ok: true });
    const operation = makeOperation(over.status);
    const status = {
        get: jest.fn().mockResolvedValue(operation),
        setRunning: jest.fn().mockResolvedValue(operation),
        setDone: jest.fn().mockResolvedValue(operation),
        setFailed: jest.fn().mockResolvedValue(operation),
    };
    const settle = jest.fn().mockResolvedValue(undefined);

    const processor = new EventFlowProcessor(
        { sendToClient: jest.fn() } as unknown as WsService,
        status as unknown as EventFlowStatusService,
        { execute } as unknown as EventReportUseCase,
        { execute: jest.fn() } as unknown as EventReportTmcUseCase,
        { acquire } as unknown as QueueConcurrencyService,
        { settle } as unknown as EventFlowDuplicateGuardService,
    );
    return { processor, acquire, release, execute, status, settle };
};

describe('EventFlowProcessor — слот очереди', () => {
    it('называет слоту id операции и клиента', async () => {
        const harness = makeHarness({
            status: EnumEventFlowStatus.QUEUED,
            acquired: true,
        });

        await harness.processor.handle(makeJob().job);

        expect(harness.acquire).toHaveBeenCalledWith({
            queue: QueueNames.EVENT_SALES_FLOW,
            domain: DOMAIN,
            entityKey: 'company:77771',
            maxPerDomain: 2,
            ownerId: OPERATION_ID,
        });
    });

    it('оборванный выкладкой отчёт (статус «выполняется») выполняется заново и отдаёт слот', async () => {
        const harness = makeHarness({
            status: EnumEventFlowStatus.RUNNING,
            acquired: true,
        });

        await harness.processor.handle(makeJob().job);

        expect(harness.acquire).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: OPERATION_ID }),
        );
        expect(harness.execute).toHaveBeenCalledTimes(1);
        expect(harness.status.setDone).toHaveBeenCalledTimes(1);
        expect(harness.release).toHaveBeenCalledTimes(1);
    });

    it('слот занят — отчёт перекладывается, а не выполняется', async () => {
        const harness = makeHarness({
            status: EnumEventFlowStatus.QUEUED,
            acquired: false,
        });
        const { job, add } = makeJob();

        await harness.processor.handle(job);

        expect(harness.execute).not.toHaveBeenCalled();
        expect(add).toHaveBeenCalledWith(
            JobNames.EVENT_SALES_FLOW,
            expect.objectContaining({
                operationId: OPERATION_ID,
                slotRetries: 1,
            }),
            expect.objectContaining({ delay: 3000 }),
        );
    });

    it('перекладки исчерпаны — отчёт помечается ошибкой, замок повтора снимается', async () => {
        const harness = makeHarness({
            status: EnumEventFlowStatus.QUEUED,
            acquired: false,
        });
        const { job, add } = makeJob(150);

        await harness.processor.handle(job);

        expect(add).not.toHaveBeenCalled();
        expect(harness.status.setFailed).toHaveBeenCalledTimes(1);
        expect(harness.settle).toHaveBeenCalledTimes(1);
    });

    it('уже выполненная операция повторно не выполняется и слот не берёт', async () => {
        const harness = makeHarness({
            status: EnumEventFlowStatus.DONE,
            acquired: true,
        });

        await harness.processor.handle(makeJob().job);

        expect(harness.acquire).not.toHaveBeenCalled();
        expect(harness.execute).not.toHaveBeenCalled();
    });
});
