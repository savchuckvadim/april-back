import { OnQueueFailed, Process } from '@nestjs/bull';
import { BullMetadataAccessor } from '@nestjs/bull/dist/bull-metadata.accessor';
import { Reflector } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { SchedulerType } from '@nestjs/schedule/dist/enums/scheduler-type.enum';
import { SchedulerMetadataAccessor } from '@nestjs/schedule/dist/schedule-metadata.accessor';
import {
    annotateCallContext,
    CALL_CLASS,
    CallContext,
    getCallContext,
    runAsInteractive,
} from '../call-context';
import { CallSource } from '../call-source.decorator';

/**
 * Обёртка метода не должна прятать его от Nest: schedule и Bull ищут кроны
 * и обработчики по метаданным на функции метода. Проверяем теми же
 * читателями метаданных, которыми пользуются их explorer-ы.
 */
const reflector = new Reflector();
const schedule = new SchedulerMetadataAccessor(reflector);
const bull = new BullMetadataAccessor(reflector);

class Jobs {
    seen: CallContext | null = null;

    // Пометка НИЖЕ @Cron — привычный порядок.
    @Cron('0 * * * * *', { name: 'rescue' })
    @CallSource('cron:rescue', 'Крон: подстраховка')
    async tick(now: Date = new Date(0)): Promise<number> {
        await Promise.resolve();
        this.seen = getCallContext();
        return now.getTime();
    }

    // Пометка ВЫШЕ @Process — метаданные всё равно переносятся.
    @CallSource('queue:flow', 'Очередь: отчёт')
    @Process({ name: 'flow', concurrency: 2 })
    handle(job: { data: string }): string {
        annotateCallContext({ entity: { type: 'deal', id: job.data } });
        this.seen = getCallContext();
        return `done:${job.data}`;
    }

    @CallSource('queue:flow')
    @OnQueueFailed()
    onFailed(): void {
        this.seen = getCallContext();
    }
}

/** Функция метода с прототипа — так её читают explorer-ы Nest. */
const methodOf = (name: 'tick' | 'handle' | 'onFailed'): (() => void) =>
    Reflect.get(Jobs.prototype, name) as () => void;

describe('@CallSource — метаданные Nest schedule и Bull на месте', () => {
    const proto = Jobs.prototype;

    it('крон (пометка ниже @Cron) найден: тип, имя и расписание', () => {
        const tick = methodOf('tick');
        expect(schedule.getSchedulerType(tick)).toBe(SchedulerType.CRON);
        expect(schedule.getSchedulerName(tick)).toBe('rescue');
        expect(schedule.getCronMetadata(tick)).toMatchObject({
            cronTime: '0 * * * * *',
            name: 'rescue',
        });
    });

    it('обработчик очереди (пометка выше @Process) найден с опциями', () => {
        expect(bull.getProcessMetadata(methodOf('handle'))).toEqual({
            name: 'flow',
            concurrency: 2,
        });
    });

    it('слушатель событий очереди (@OnQueueFailed) найден', () => {
        expect(bull.getListenerMetadata(methodOf('onFailed'))).toMatchObject({
            eventName: 'failed',
        });
    });

    it('имя функции метода сохраняется — для логов и стеков', () => {
        expect(proto.tick.name).toBe('tick');
        expect(proto.handle.name).toBe('handle');
    });

    it('число параметров сохраняется — Bull по нему выбирает промис или колбэк', () => {
        class Callbacks {
            @CallSource('queue:cb')
            handle(job: unknown, done: (result: unknown) => void): void {
                done(job);
            }
        }

        expect(proto.handle.length).toBe(1);
        expect(Callbacks.prototype.handle.length).toBe(2);
    });
});

describe('@CallSource — контекст вызова', () => {
    it('крон идёт фоном со своим source и операцией; this и аргументы по умолчанию целы', async () => {
        const jobs = new Jobs();

        await expect(jobs.tick()).resolves.toBe(0);
        expect(jobs.seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'cron:rescue',
            operation: 'Крон: подстраховка',
        });
    });

    it('синхронный обработчик возвращает значение, пометки видны внутри', () => {
        const jobs = new Jobs();

        expect(jobs.handle({ data: '26735' })).toBe('done:26735');
        expect(jobs.seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'queue:flow',
            operation: 'Очередь: отчёт',
            entity: { type: 'deal', id: '26735' },
        });
    });

    it('каждый вызов — свой контекст: пометки прошлого джоба не видны', () => {
        const jobs = new Jobs();
        jobs.handle({ data: '1' });

        jobs.onFailed();

        expect(jobs.seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'queue:flow',
        });
    });

    it('ручной запуск из HTTP: операция запроса не перетирается, source — крона', async () => {
        const jobs = new Jobs();

        await runAsInteractive('POST /api/run-now', async () => {
            annotateCallContext({ operation: 'Ручной запуск' });
            await jobs.tick();
        });

        expect(jobs.seen).toEqual({
            callClass: CALL_CLASS.background,
            source: 'cron:rescue',
            operation: 'Ручной запуск',
        });
    });

    it('ошибка метода доходит до вызывающего', async () => {
        class Failing {
            @CallSource('cron:failing')
            async run(): Promise<void> {
                await Promise.resolve();
                throw new Error('сбой крона');
            }
        }

        await expect(new Failing().run()).rejects.toThrow('сбой крона');
    });
});
