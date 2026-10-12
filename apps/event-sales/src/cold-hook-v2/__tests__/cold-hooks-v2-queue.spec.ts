import 'reflect-metadata';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { BULL_MODULE_QUEUE_PROCESS } from '@nestjs/bull/dist/bull.constants';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { ColdHookSilinceEndpointV2Service } from '../services/silence/cold-hook-silince-endpoint.service';
import { ColdHooksV2Processor } from '../queue/cold-hooks-v2.processor';
import { EnumColdCallEntityType, EnumColdCallIsTmc } from '../dto/cold.dto';
import { IColdCallData } from '../type/cold-hook-silence.interface';

/**
 * Окна тишины холодного старта v2 обрабатываются строго по одному (gsr,
 * 07.10.2026: два окна по одному клиенту шли параллельно — 29 компаний с
 * двумя парами работ).
 *
 * Защищается:
 *  1. подписчик окна не работает сам, а ставит пачку в свою очередь;
 *  2. подписчик объявлен БЕЗ `{ async: true }` — иначе emitAsync его не ждёт;
 *  3. обработчик очереди один и с concurrency 1, отдаёт пачку в handleHooks.
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

describe('холодный старт v2: окно тишины → своя очередь', () => {
    it('подписчик ставит пачку в EVENT_SALES_COLD_CALL_V2 и сам не работает', async () => {
        const dispatch = jest.fn().mockResolvedValue({ id: '1' });
        const endpoint = new ColdHookSilinceEndpointV2Service(
            { handle: jest.fn() } as never,
            { dispatch } as never,
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

    it('обработчик очереди один, concurrency 1, отдаёт пачку в handleHooks', async () => {
        const meta = Reflect.getMetadata(
            BULL_MODULE_QUEUE_PROCESS,
            methodOf(ColdHooksV2Processor.prototype, 'handle'),
        ) as ProcessMeta;
        expect(meta).toEqual({
            name: JobNames.EVENT_COLD_CALL_V2,
            concurrency: 1,
        });

        const handleHooks = jest.fn().mockResolvedValue(undefined);
        const processor = new ColdHooksV2Processor({ handleHooks } as never);
        const collected = { '1': hook('81925') };

        await processor.handle({
            id: 7,
            timestamp: Date.now(),
            data: { collected, payload: { domain: DOMAIN } },
        } as never);

        expect(handleHooks).toHaveBeenCalledWith(DOMAIN, collected);
    });
});
