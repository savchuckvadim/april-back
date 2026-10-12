import 'reflect-metadata';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { BULL_MODULE_QUEUE_PROCESS } from '@nestjs/bull/dist/bull.constants';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { ColdHookSilinceEndpointService } from '../services/silence/cold-hook-silince-endpoint.service';
import { ColdHooksProcessor } from '../queue/cold-hooks.processor';
import { EnumColdCallEntityType, EnumColdCallIsTmc } from '../dto/cold.dto';
import { IColdCallData } from '../type/cold-hook-silence.interface';

/**
 * Холодный старт v1: окно тишины → очередь EVENT_SALES_COLD_CALL, где окна
 * идут строго по одному (раньше подписчик работал сам с `{ async: true }`, и
 * окна шли параллельно).
 */

type ListenerMeta = { event: string; options?: { async?: boolean } };
type ProcessMeta = { name?: string; concurrency?: number } | string;

/** Метод прототипа без привязки к this — только как ключ метаданных. */
const methodOf = (proto: object, key: string): object =>
    Object.getOwnPropertyDescriptor(proto, key)?.value as object;

const DOMAIN = 'example.bitrix24.ru';
const hook: IColdCallData = {
    entityType: EnumColdCallEntityType.COMPANY,
    entityId: '15',
    responsible: '7',
    created: '7',
    deadline: '13.10.2026 10:00:00',
    name: 'Холодный обзвон',
    isTmc: EnumColdCallIsTmc.N,
};

describe('холодный старт v1: окно тишины → своя очередь', () => {
    it('подписчик ставит пачку в EVENT_SALES_COLD_CALL', async () => {
        const dispatch = jest.fn().mockResolvedValue({ id: '1' });
        const endpoint = new ColdHookSilinceEndpointService(
            { handle: jest.fn() } as never,
            { dispatch } as never,
        );

        await endpoint.onColdCallSilence({
            collected: { '1': hook },
            payload: { domain: DOMAIN },
        });

        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.EVENT_SALES_COLD_CALL,
            JobNames.EVENT_COLD_CALL,
            { collected: { '1': hook }, payload: { domain: DOMAIN } },
        );
    });

    it('подписчик без { async: true }, обработчик очереди один', () => {
        const meta = Reflect.getMetadata(
            EVENT_LISTENER_METADATA,
            methodOf(
                ColdHookSilinceEndpointService.prototype,
                'onColdCallSilence',
            ),
        ) as ListenerMeta[];
        expect(meta[0].options?.async).not.toBe(true);

        const process = Reflect.getMetadata(
            BULL_MODULE_QUEUE_PROCESS,
            methodOf(ColdHooksProcessor.prototype, 'handle'),
        ) as ProcessMeta;
        // @Process(name) — default concurrency Bull = 1.
        const name = typeof process === 'string' ? process : process.name;
        expect(name).toBe(JobNames.EVENT_COLD_CALL);
    });
});
