import 'reflect-metadata';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { BULL_MODULE_QUEUE_PROCESS } from '@nestjs/bull/dist/bull.constants';
import { SalesHookSilenceSubscriber } from '../queue/sales-hook-silence.subscriber';
import { SalesHookOpsProcessor } from '../queue/sales-hook-ops.processor';
import { SALES_HOOK_JOB_NAMES } from '../constants/sales-hook-code.enum';

/**
 * Связка хуков продаж: окно тишины → очередь операций.
 *
 *  1. Слушатели объявлены БЕЗ `{ async: true }`: с флагом EventEmitter2 зовёт
 *     слушателя через setImmediate и не ждёт его — задание event-silent
 *     закрывалось раньше постановки операции (найдено 12.10.2026).
 *  2. У КАЖДОГО хука есть и слушатель `silence:<job>`, и обработчик джобы в
 *     EVENT_SALES_HOOK_OPS. У «Присоединить к основной» не было ни того ни
 *     другого: робот молча терялся, кнопка падала «Missing process handler».
 */

type ListenerMeta = { event: string; options?: { async?: boolean } };
type ProcessMeta = { name?: string; concurrency?: number };

const metaOf = <T>(proto: object, key: string, metaKey: string): T[] => {
    const method = Object.getOwnPropertyDescriptor(proto, key)?.value as object;
    const meta = Reflect.getMetadata(metaKey, method) as T | T[] | undefined;
    if (meta === undefined) return [];
    return Array.isArray(meta) ? meta : [meta];
};

const listeners = Object.getOwnPropertyNames(
    SalesHookSilenceSubscriber.prototype,
).flatMap(key =>
    metaOf<ListenerMeta>(
        SalesHookSilenceSubscriber.prototype,
        key,
        EVENT_LISTENER_METADATA,
    ),
);

const processes = Object.getOwnPropertyNames(
    SalesHookOpsProcessor.prototype,
).flatMap(key =>
    metaOf<ProcessMeta>(
        SalesHookOpsProcessor.prototype,
        key,
        BULL_MODULE_QUEUE_PROCESS,
    ),
);

describe('sales-хуки: окно тишины → очередь операций', () => {
    it('ни один слушатель не объявлен с { async: true }', () => {
        expect(listeners.length).toBeGreaterThanOrEqual(9);
        expect(listeners.filter(m => m.options?.async === true)).toEqual([]);
    });

    it.each(Object.entries(SALES_HOOK_JOB_NAMES))(
        'хук %s: есть слушатель окна тишины и обработчик очереди',
        (_hook, jobName) => {
            expect(listeners.map(m => m.event)).toContain(`silence:${jobName}`);
            expect(processes.map(p => p.name)).toContain(jobName);
        },
    );
});
