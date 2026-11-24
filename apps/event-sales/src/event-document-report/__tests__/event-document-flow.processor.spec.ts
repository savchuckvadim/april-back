import { Logger } from '@nestjs/common';
import { JobNames, QueueNames, SalesDocumentEventJobData } from '@lib/queue';
import { EventDocumentFlowJobData } from '../dto/event-document-flow-job.dto';
import { EventDocumentWriteError } from '../lib/event-document-write.error';
import { EventDocumentFlowProcessor } from '../queue/event-document-flow.processor';
import {
    DOCUMENT_COMPANY_ID,
    DOCUMENT_DOMAIN,
    DOCUMENT_EVENT_ID,
    makeEvent,
} from './event-document.fixtures';

interface SlotHandle {
    acquired: boolean;
    reason?: string;
    release: () => Promise<void>;
}

interface UseCaseResult {
    commands: number;
}

type RequeueOptions = Record<string, unknown>;

const makeJob = (slotRetries?: number) => {
    const add = jest
        .fn<Promise<void>, [string, EventDocumentFlowJobData, RequeueOptions]>()
        .mockResolvedValue(undefined);
    const data: EventDocumentFlowJobData = { ...makeEvent(), slotRetries };
    return { job: { data, queue: { add } } as never, add, data };
};

const makeHarness = (over: { acquired?: boolean; reserved?: boolean } = {}) => {
    const { acquired = true, reserved = true } = over;
    const slotRelease = jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined);
    const acquire = jest
        .fn<Promise<SlotHandle>, [Record<string, unknown>]>()
        .mockResolvedValue({
            acquired,
            reason: acquired ? undefined : 'entity-busy',
            release: slotRelease,
        });
    const execute = jest
        .fn<Promise<UseCaseResult>, [SalesDocumentEventJobData]>()
        .mockResolvedValue({ commands: 3 });
    const reserve = jest
        .fn<Promise<boolean>, [string, string]>()
        .mockResolvedValue(reserved);
    const releaseMark = jest
        .fn<Promise<void>, [string, string]>()
        .mockResolvedValue(undefined);

    const processor = new EventDocumentFlowProcessor(
        { execute } as never,
        { acquire } as never,
        { reserve, release: releaseMark } as never,
    );
    return { processor, acquire, slotRelease, execute, reserve, releaseMark };
};

/**
 * Воркер потока документов. Документы одного клиента идут строго по одному
 * (слот клиента), событие выполняется не больше одного раза (отметка в
 * Redis), а слот отдаётся при любом исходе.
 */
describe('EventDocumentFlowProcessor — слот клиента и отметка события', () => {
    let logError: jest.SpyInstance;
    let logWarn: jest.SpyInstance;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        logWarn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        logError = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    // Слот → отметка → выполнение → слот отдан.
    describe('обычный путь', () => {
        it('слот берётся по клиенту, событие помечается взятым в работу и выполняется', async () => {
            const harness = makeHarness();
            const { job, data } = makeJob();

            await harness.processor.handle(job);

            expect(harness.acquire).toHaveBeenCalledWith({
                queue: QueueNames.EVENT_SALES_DOCUMENT_FLOW,
                domain: DOCUMENT_DOMAIN,
                entityKey: `company:${DOCUMENT_COMPANY_ID}`,
                maxPerDomain: 2,
                ownerId: DOCUMENT_EVENT_ID,
            });
            expect(harness.reserve).toHaveBeenCalledWith(
                DOCUMENT_DOMAIN,
                DOCUMENT_EVENT_ID,
            );
            expect(harness.execute).toHaveBeenCalledTimes(1);
            expect(harness.execute).toHaveBeenCalledWith(data);
        });

        it('слот отдаётся после выполнения, отметка остаётся', async () => {
            const harness = makeHarness();

            await harness.processor.handle(makeJob().job);

            expect(harness.slotRelease).toHaveBeenCalledTimes(1);
            expect(harness.releaseMark).not.toHaveBeenCalled();
            const order = (mock: jest.Mock) => mock.mock.invocationCallOrder[0];
            expect(order(harness.acquire)).toBeLessThan(order(harness.reserve));
            expect(order(harness.reserve)).toBeLessThan(order(harness.execute));
            expect(order(harness.execute)).toBeLessThan(
                order(harness.slotRelease),
            );
        });
    });

    // Занятый слот — джоб уезжает в конец очереди, а не стоит на месте.
    describe('слот клиента занят', () => {
        it('событие не выполняется и отметку не трогает, а джоб перекладывается с задержкой', async () => {
            const harness = makeHarness({ acquired: false });
            const { job, add, data } = makeJob();

            await expect(
                harness.processor.handle(job),
            ).resolves.toBeUndefined();

            expect(harness.execute).not.toHaveBeenCalled();
            expect(harness.reserve).not.toHaveBeenCalled();
            expect(harness.releaseMark).not.toHaveBeenCalled();
            expect(add).toHaveBeenCalledTimes(1);
            expect(add).toHaveBeenCalledWith(
                JobNames.EVENT_SALES_DOCUMENT_FLOW,
                { ...data, slotRetries: 1 },
                {
                    delay: 3000,
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            );
        });

        it('каждая перекладка увеличивает счётчик на единицу', async () => {
            const harness = makeHarness({ acquired: false });
            const { job, add } = makeJob(5);

            await harness.processor.handle(job);

            expect(add).toHaveBeenCalledWith(
                JobNames.EVENT_SALES_DOCUMENT_FLOW,
                expect.objectContaining({ slotRetries: 6 }),
                expect.objectContaining({ delay: 3000 }),
            );
        });

        it('последняя допустимая перекладка (150-я) ещё ставится', async () => {
            const harness = makeHarness({ acquired: false });
            const { job, add } = makeJob(149);

            await harness.processor.handle(job);

            expect(add).toHaveBeenCalledWith(
                JobNames.EVENT_SALES_DOCUMENT_FLOW,
                expect.objectContaining({ slotRetries: 150 }),
                expect.anything(),
            );
        });

        it('перекладок больше потолка: новый джоб не ставится, событие не выполняется, сбой уходит в Telegram', async () => {
            const harness = makeHarness({ acquired: false });
            const { job, add } = makeJob(150);

            await expect(
                harness.processor.handle(job),
            ).resolves.toBeUndefined();

            expect(add).not.toHaveBeenCalled();
            expect(harness.execute).not.toHaveBeenCalled();
            expect(harness.reserve).not.toHaveBeenCalled();
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('не дождалось слота'),
                { telegram: true, domain: DOCUMENT_DOMAIN },
            );
        });
    });

    // Повторная доставка того же события не засчитывает документ второй раз.
    describe('событие уже выполнялось', () => {
        it('отметка занята: событие не выполняется, слот отдаётся, исключения нет', async () => {
            const harness = makeHarness({ reserved: false });

            await expect(
                harness.processor.handle(makeJob().job),
            ).resolves.toBeUndefined();

            expect(harness.execute).not.toHaveBeenCalled();
            expect(harness.slotRelease).toHaveBeenCalledTimes(1);
        });

        it('чужую отметку не снимает — повтор остаётся пропущенным', async () => {
            const harness = makeHarness({ reserved: false });

            await harness.processor.handle(makeJob().job);

            expect(harness.releaseMark).not.toHaveBeenCalled();
            expect(logWarn).toHaveBeenCalledWith(
                expect.stringContaining('уже выполнялось'),
                { telegram: true, domain: DOCUMENT_DOMAIN },
            );
        });
    });

    // Отметка снимается, только если до записи в Битрикс дело не дошло.
    describe('сбой при выполнении', () => {
        it('обычная ошибка: отметка снимается, слот отдаётся, ошибка пробрасывается', async () => {
            const harness = makeHarness();
            const error = new Error('Битрикс не отвечает');
            harness.execute.mockRejectedValue(error);

            await expect(harness.processor.handle(makeJob().job)).rejects.toBe(
                error,
            );

            // До записи в Битрикс дело не дошло — событие можно повторить.
            expect(harness.releaseMark).toHaveBeenCalledWith(
                DOCUMENT_DOMAIN,
                DOCUMENT_EVENT_ID,
            );
            expect(harness.slotRelease).toHaveBeenCalledTimes(1);
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('Битрикс не отвечает'),
                { telegram: true, domain: DOCUMENT_DOMAIN },
            );
        });

        it('ошибка записи: отметка НЕ снимается, слот отдаётся, ошибка пробрасывается', async () => {
            const harness = makeHarness();
            const error = new EventDocumentWriteError(new Error('batch упал'));
            harness.execute.mockRejectedValue(error);

            await expect(harness.processor.handle(makeJob().job)).rejects.toBe(
                error,
            );

            // Часть команд могла выполниться: повтор удвоил бы счётчики.
            expect(harness.releaseMark).not.toHaveBeenCalled();
            expect(harness.slotRelease).toHaveBeenCalledTimes(1);
            expect(logError).toHaveBeenCalledWith(
                expect.stringContaining('batch упал'),
                { telegram: true, domain: DOCUMENT_DOMAIN },
            );
        });
    });
});
