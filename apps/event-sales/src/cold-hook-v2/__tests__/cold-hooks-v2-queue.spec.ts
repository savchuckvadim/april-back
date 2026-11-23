import 'reflect-metadata';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { BULL_MODULE_QUEUE_PROCESS } from '@nestjs/bull/dist/bull.constants';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueLaneAcquire } from '@lib/queue/concurrency/queue-lane.service';
import { InMemoryLaunchRegistry } from '../../shared/xo-dispatch/launch/__tests__/in-memory-launch-registry';
import { ColdHookSilinceEndpointV2Service } from '../services/silence/cold-hook-silince-endpoint.service';
import {
    ColdHooksV2Processor,
    XO_LANE_RETRY_DELAY_MS,
    XO_LANE_WAIT_ALERT_MS,
} from '../queue/cold-hooks-v2.processor';
import { EnumColdCallEntityType, EnumColdCallIsTmc } from '../dto/cold.dto';
import {
    IColdCallData,
    IColdHookSilenceHandlerData,
} from '../type/cold-hook-silence.interface';

/**
 * Окна тишины холодного старта v2: порталы параллельно, окна одного портала
 * строго по одному (gsr, 07.10.2026: два окна по одному клиенту шли
 * параллельно — 29 компаний с двумя парами работ; gsr 20.11.2026: ХО ждал
 * 6 минут за окнами упавшего garant).
 *
 * Защищается:
 *  1. подписчик окна не работает сам, а ставит пачку в свою очередь;
 *  2. подписчик объявлен БЕЗ `{ async: true }` — иначе emitAsync его не ждёт;
 *  3. обработчик очереди один, окно берёт кассу своего портала; занята —
 *     окно уезжает обратно в очередь с задержкой.
 */

type ListenerMeta = { event: string; options?: { async?: boolean } };
type ProcessMeta = { name?: string; concurrency?: number };

/** Метод прототипа без привязки к this — только как ключ метаданных. */
const methodOf = (proto: object, key: string): object =>
    Object.getOwnPropertyDescriptor(proto, key)?.value as object;

const DOMAIN = 'gsr.bitrix24.ru';
const hook = (entityId: string): IColdCallData => ({
    entityType: EnumColdCallEntityType.COMPANY,
    entityId,
    isTmc: EnumColdCallIsTmc.N,
});

const makeJob = (
    data: Partial<IColdHookSilenceHandlerData> = {},
    timestamp = Date.now(),
) => {
    const add = jest.fn().mockResolvedValue({ id: 'requeued' });
    const job = {
        id: 7,
        timestamp,
        data: {
            collected: { '1': hook('81925') },
            payload: { domain: DOMAIN },
            ...data,
        },
        queue: { add },
    };
    return { job, add };
};

const makeProcessor = (lane: QueueLaneAcquire) => {
    const handleHooks = jest.fn().mockResolvedValue(undefined);
    const acquire = jest.fn().mockResolvedValue(lane);
    const processor = new ColdHooksV2Processor(
        { handleHooks } as never,
        { acquire } as never,
    );
    return { processor, handleHooks, acquire };
};

describe('холодный старт v2: окно тишины → своя очередь', () => {
    it('подписчик ставит пачку в EVENT_SALES_COLD_CALL_V2 и сам не работает', async () => {
        const dispatch = jest.fn().mockResolvedValue({ id: '1' });
        const endpoint = new ColdHookSilinceEndpointV2Service(
            { handle: jest.fn() } as never,
            { dispatch } as never,
            new InMemoryLaunchRegistry() as never,
        );
        const collected = { '1': hook('81925'), '2': hook('95833') };

        await endpoint.onColdCallSilence({
            collected,
            payload: { domain: DOMAIN },
        });

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.EVENT_SALES_COLD_CALL_V2,
            JobNames.EVENT_COLD_CALL_V2,
            { collected, payload: { domain: DOMAIN } },
        );
    });

    it('подписчик объявлен без { async: true } — emitAsync его ждёт', () => {
        const meta = Reflect.getMetadata(
            EVENT_LISTENER_METADATA,
            methodOf(
                ColdHookSilinceEndpointV2Service.prototype,
                'onColdCallSilence',
            ),
        ) as ListenerMeta[];
        expect(meta).toHaveLength(1);
        expect(meta[0].event).toBe(`silence:${JobNames.EVENT_COLD_CALL_V2}`);
        expect(meta[0].options?.async).not.toBe(true);
    });

    it('обработчик один на очередь, окон одновременно — до 8 (разные порталы)', () => {
        const meta = Reflect.getMetadata(
            BULL_MODULE_QUEUE_PROCESS,
            methodOf(ColdHooksV2Processor.prototype, 'handle'),
        ) as ProcessMeta;
        expect(meta).toEqual({
            name: JobNames.EVENT_COLD_CALL_V2,
            concurrency: 8,
        });
    });
});

describe('приём холодного звонка: отметка запуска', () => {
    it('каждый хук получает номер и время приёма, карточка — «ждёт обработки»', async () => {
        const handle = jest.fn().mockResolvedValue(undefined);
        const registry = new InMemoryLaunchRegistry();
        const endpoint = new ColdHookSilinceEndpointV2Service(
            { handle } as never,
            { dispatch: jest.fn() } as never,
            registry as never,
        );

        await endpoint.createColdCallHook(DOMAIN, hook('117743'));

        const [item] = handle.mock.calls[0] as [
            { data: IColdCallData; domain: string },
        ];
        expect(item.data.launch?.id).toEqual(expect.any(String));
        expect(item.data.launch?.acceptedAt).toEqual(expect.any(Number));
        expect(await registry.pending(DOMAIN, ['company:117743'])).toEqual(
            new Set(['company:117743']),
        );
    });

    it('хук не лёг в окно — карточка не помечается (крон её дошлёт)', async () => {
        const registry = new InMemoryLaunchRegistry();
        const endpoint = new ColdHookSilinceEndpointV2Service(
            {
                handle: jest.fn().mockRejectedValue(new Error('redis down')),
            } as never,
            { dispatch: jest.fn() } as never,
            registry as never,
        );

        await expect(
            endpoint.createColdCallHook(DOMAIN, hook('117743')),
        ).rejects.toThrow('redis down');
        expect(await registry.pending(DOMAIN, ['company:117743'])).toEqual(
            new Set(),
        );
    });
});

describe('касса портала в очереди холодного старта v2', () => {
    it('касса свободна — окно обрабатывается, касса освобождается', async () => {
        const release = jest.fn().mockResolvedValue(undefined);
        const { processor, handleHooks, acquire } = makeProcessor({
            status: 'acquired',
            release,
        });
        const { job, add } = makeJob();

        await processor.handle(job as never);

        expect(acquire).toHaveBeenCalledWith({
            queue: QueueNames.EVENT_SALES_COLD_CALL_V2,
            lane: DOMAIN,
        });
        expect(handleHooks).toHaveBeenCalledWith(DOMAIN, job.data.collected);
        expect(release).toHaveBeenCalledTimes(1);
        expect(add).not.toHaveBeenCalled();
    });

    it('касса освобождается, даже если окно упало', async () => {
        const release = jest.fn().mockResolvedValue(undefined);
        const { processor, handleHooks } = makeProcessor({
            status: 'acquired',
            release,
        });
        handleHooks.mockRejectedValueOnce(new Error('500'));
        const { job } = makeJob();

        await expect(processor.handle(job as never)).rejects.toThrow('500');
        expect(release).toHaveBeenCalledTimes(1);
    });

    it('касса занята — окно уезжает обратно в очередь, сейчас не обрабатывается', async () => {
        const { processor, handleHooks } = makeProcessor({ status: 'busy' });
        const queuedAt = Date.now();
        const { job, add } = makeJob({}, queuedAt);

        await processor.handle(job as never);

        expect(handleHooks).not.toHaveBeenCalled();
        expect(add).toHaveBeenCalledWith(
            JobNames.EVENT_COLD_CALL_V2,
            {
                ...job.data,
                lane: { retries: 1, firstQueuedAt: queuedAt, alerted: false },
            },
            {
                delay: XO_LANE_RETRY_DELAY_MS,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    });

    it('при перекладке время первой постановки сохраняется, счётчик растёт', async () => {
        const { processor } = makeProcessor({ status: 'busy' });
        const firstQueuedAt = Date.now() - 60_000;
        const { job, add } = makeJob(
            { lane: { retries: 4, firstQueuedAt, alerted: false } },
            Date.now(),
        );

        await processor.handle(job as never);

        const [, data] = add.mock.calls[0] as [
            string,
            IColdHookSilenceHandlerData,
        ];
        expect(data.lane).toEqual({
            retries: 5,
            firstQueuedAt,
            alerted: false,
        });
    });

    it('ждёт дольше 15 минут — предупреждение один раз', async () => {
        const { processor } = makeProcessor({ status: 'busy' });
        const firstQueuedAt = Date.now() - XO_LANE_WAIT_ALERT_MS - 1;
        const { job, add } = makeJob({
            lane: { retries: 300, firstQueuedAt, alerted: false },
        });

        await processor.handle(job as never);

        const [, data] = add.mock.calls[0] as [
            string,
            IColdHookSilenceHandlerData,
        ];
        expect(data.lane?.alerted).toBe(true);
    });

    it('Redis не ответил про кассу — окно перекладывается, а не идёт параллельно', async () => {
        const { processor, handleHooks } = makeProcessor({
            status: 'unavailable',
            reason: 'ECONNREFUSED',
        });
        const { job, add } = makeJob();

        await processor.handle(job as never);

        expect(handleHooks).not.toHaveBeenCalled();
        expect(add).toHaveBeenCalledTimes(1);
    });

    it('не удалось и переложить — окно обрабатывается, а не теряется', async () => {
        const { processor, handleHooks } = makeProcessor({ status: 'busy' });
        const { job, add } = makeJob();
        add.mockRejectedValueOnce(new Error('Connection is closed.'));

        await processor.handle(job as never);

        expect(handleHooks).toHaveBeenCalledWith(DOMAIN, job.data.collected);
    });
});
