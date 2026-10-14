import { INestApplication, Logger, LoggerService, Type } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';

/** Что именно остановил режим ожидания — для лога и тестов. */
export interface StandbyReport {
    readonly cronJobs: readonly string[];
    readonly intervals: readonly string[];
    readonly timeouts: readonly string[];
    readonly queues: readonly string[];
}

type ScheduleReport = Pick<
    StandbyReport,
    'cronJobs' | 'intervals' | 'timeouts'
>;

/**
 * Очередь Bull глазами режима ожидания: имя и локальная пауза.
 * Структурный тип вместо `Queue` из `bull`: core не зависит от очередей,
 * а нужен один метод.
 */
export interface PausableQueue {
    readonly name: string;
    pause(isLocal?: boolean, doNotWaitActive?: boolean): Promise<void>;
}

/** Так `@nestjs/bull` именует DI-токены очередей (getQueueToken). */
const BULL_QUEUE_TOKEN_PREFIX = 'BullQueue_';

const isPausableQueue = (value: unknown): value is PausableQueue =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PausableQueue).name === 'string' &&
    typeof (value as PausableQueue).pause === 'function';

/**
 * Очереди Bull из DI-контейнера: провайдеры с токеном `BullQueue_<имя>`.
 * Один инстанс может быть зарегистрирован в нескольких модулях — считаем
 * его один раз.
 */
export const collectBullQueues = (
    container: ModulesContainer,
): PausableQueue[] => {
    const queues = new Set<PausableQueue>();
    for (const module of container.values()) {
        for (const [token, wrapper] of module.providers) {
            if (
                typeof token !== 'string' ||
                !token.startsWith(BULL_QUEUE_TOKEN_PREFIX)
            ) {
                continue;
            }
            const instance: unknown = wrapper.instance;
            if (isPausableQueue(instance)) {
                queues.add(instance);
            }
        }
    }
    return [...queues];
};

/**
 * Остановить всё расписание приложения. Реестра нет (приложение без
 * `ScheduleModule.forRoot()`) — останавливать нечего.
 */
export const stopSchedule = async (
    registry: SchedulerRegistry | undefined,
): Promise<ScheduleReport> => {
    if (!registry) {
        return { cronJobs: [], intervals: [], timeouts: [] };
    }
    const cronJobs: string[] = [];
    for (const [name, job] of registry.getCronJobs()) {
        await job.stop();
        cronJobs.push(name);
    }
    const intervals = registry.getIntervals();
    intervals.forEach(name => registry.deleteInterval(name));
    const timeouts = registry.getTimeouts();
    timeouts.forEach(name => registry.deleteTimeout(name));
    return { cronJobs, intervals, timeouts };
};

/**
 * Пауза воркеров очередей только в этом процессе (`isLocal`): состояние
 * очереди в Redis не трогаем — на зеркале это реплика, и она только для
 * чтения. Активных задач на старте нет, ждать их незачем.
 */
export const pauseQueues = async (
    queues: readonly PausableQueue[],
): Promise<string[]> => {
    const names: string[] = [];
    for (const queue of queues) {
        await queue.pause(true, true);
        names.push(queue.name);
    }
    return names;
};

const list = (names: readonly string[]): string =>
    names.length ? `${names.length} (${names.join(', ')})` : 'нет';

/** Текст предупреждения о режиме ожидания для лога и Telegram. */
export const formatStandbyReport = (report: StandbyReport): string =>
    [
        '⏸ Режим ожидания (APP_ROLE=standby): приложение отвечает, но само не действует.',
        `• кроны остановлены: ${list(report.cronJobs)}`,
        `• интервалы сняты: ${list(report.intervals)}`,
        `• таймауты сняты: ${list(report.timeouts)}`,
        `• воркеры очередей на паузе: ${list(report.queues)}`,
    ].join('\n');

/**
 * Провайдер, которого в приложении может не быть (например,
 * `SchedulerRegistry` без `ScheduleModule`). `strict:false` — app обёрнут
 * в ExceptionsZone-proxy, строгий `get` уронил бы процесс.
 */
const optionalProvider = <T>(
    app: INestApplication,
    token: Type<T> | string | symbol,
): T | undefined => {
    try {
        return app.get<T>(token, { strict: false });
    } catch {
        return undefined;
    }
};

/**
 * Перевести уже инициализированное приложение в режим ожидания: кроны,
 * интервалы и таймауты остановлены, воркеры Bull на локальной паузе.
 * Вызывать после `app.init()`: кроны и воркеры регистрируются в хуках
 * жизненного цикла, до инициализации их просто нет.
 */
export const applyStandbyMode = async (
    app: INestApplication,
    logger: LoggerService = new Logger('StandbyMode'),
): Promise<StandbyReport> => {
    const schedule = await stopSchedule(
        optionalProvider<SchedulerRegistry>(app, SchedulerRegistry),
    );
    const container = optionalProvider<ModulesContainer>(app, ModulesContainer);
    const queues = await pauseQueues(
        container ? collectBullQueues(container) : [],
    );
    const report: StandbyReport = { ...schedule, queues };
    logger.warn(formatStandbyReport(report), { telegram: true });
    return report;
};
