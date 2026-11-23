import { Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { annotateCallContext, CallSource } from '@lib/core/call-context';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import {
    QueueLaneAcquire,
    QueueLaneService,
} from '@lib/queue/concurrency/queue-lane.service';
import { resolveQueueConcurrency } from '@lib/queue/concurrency/resolve-queue-concurrency';
import {
    IColdHookLaneWait,
    IColdHookSilenceHandlerData,
} from '../type/cold-hook-silence.interface';
import { ColdHooksHandlerV2Service } from '../services/silence/cold-hooks-handler.service';
import {
    COLD_CALL_OPERATION,
    coldCallWindowCallContext,
} from '../lib/cold-call-call-context';

/**
 * Сколько окон разных порталов обрабатывается одновременно (env
 * `EVENT_SALES_XO_LANES`). Окно почти всё время ждёт ответа Битрикса, так
 * что это не ядра и не потоки — один процесс держит их все.
 */
export const XO_LANES = resolveQueueConcurrency('EVENT_SALES_XO_LANES', 8);

/** Касса портала занята — через сколько окно попробует снова. */
export const XO_LANE_RETRY_DELAY_MS = 3000;

/** Окно ждёт кассу дольше — одно предупреждение в Telegram. */
export const XO_LANE_WAIT_ALERT_MS = 15 * 60_000;

/**
 * Обработка окна тишины холодного старта v2: порталы — параллельно, окна
 * ОДНОГО портала — строго по одному.
 *
 * Окно читает связи клиента и только потом пишет работу (две фазы
 * `handleHooks`). Два окна по одному клиенту, идущие параллельно, читают
 * связи до записи друг друга, и каждое создаёт свою пару работ (gsr,
 * 07.10.2026: массовый ХО запустили дважды — 29 компаний получили по две
 * основные). Клиент всегда на одном портале, поэтому хватает «кассы» на
 * портал (`QueueLaneService`): окно другого портала ей не мешает.
 *
 * До 23.11.2026 здесь был concurrency 1 на ВСЕ порталы: долгая пачка
 * одного портала держала остальные (gsr 20.11: ХО ждал 6 минут за окнами
 * упавшего garant).
 *
 * Касса занята — окно не ждёт её, занимая место обработчика, а уезжает
 * обратно в очередь с задержкой (как отчёты в `EventFlowProcessor`). Отказа
 * по времени нет: касса не может зависнуть, она истекает сама.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_COLD_CALL_V2)
export class ColdHooksV2Processor {
    private readonly logger = new Logger(ColdHooksV2Processor.name);

    constructor(
        private readonly hooksHandler: ColdHooksHandlerV2Service,
        private readonly lanes: QueueLaneService,
    ) {}

    @Process({ name: JobNames.EVENT_COLD_CALL_V2, concurrency: XO_LANES })
    @CallSource(
        `queue:${JobNames.EVENT_COLD_CALL_V2}`,
        COLD_CALL_OPERATION.window,
    )
    async handle(job: Job<IColdHookSilenceHandlerData>): Promise<void> {
        const { collected, payload } = job.data;
        const lane = await this.lanes.acquire({
            queue: QueueNames.EVENT_SALES_COLD_CALL_V2,
            lane: payload.domain,
        });
        if (lane.status !== 'acquired' && (await this.requeue(job, lane))) {
            return;
        }
        annotateCallContext(() =>
            coldCallWindowCallContext(payload.domain, collected),
        );

        const firstQueuedAt = job.data.lane?.firstQueuedAt ?? job.timestamp;
        this.logger.log(
            `[cold-v2 queue] jobId=${job.id} domain=${payload.domain} ` +
                `hooks=${Object.keys(collected).length} ` +
                `waitedMs=${Date.now() - firstQueuedAt} ` +
                `laneRetries=${job.data.lane?.retries ?? 0}`,
        );
        try {
            await this.hooksHandler.handleHooks(payload.domain, collected);
        } finally {
            if (lane.status === 'acquired') await lane.release();
        }
    }

    @OnQueueFailed()
    onFailed(job: Job, error: Error): void {
        this.logger.error(
            `[cold-v2 queue] jobId=${job.id} упал: ${error.message}`,
        );
    }

    /**
     * Касса занята (или Redis не ответил) — окно уезжает обратно в очередь.
     * true — переложено, обрабатывать сейчас не надо.
     *
     * Не удалось и переложить — false: окно обрабатывается без кассы, с
     * ошибкой в Telegram. Потерять окно хуже, чем рискнуть параллелью.
     */
    private async requeue(
        job: Job<IColdHookSilenceHandlerData>,
        lane: Exclude<QueueLaneAcquire, { status: 'acquired' }>,
    ): Promise<boolean> {
        const domain = job.data.payload.domain;
        const wait = this.nextWait(job);
        if (
            !wait.alerted &&
            Date.now() - wait.firstQueuedAt > XO_LANE_WAIT_ALERT_MS
        ) {
            wait.alerted = true;
            this.logger.warn(
                `[cold-v2 queue] ${domain}: окно ХО ждёт очереди портала дольше ` +
                    `${XO_LANE_WAIT_ALERT_MS / 60_000} минут (перекладок ${wait.retries})`,
                { telegram: true, domain },
            );
        }
        if (lane.status === 'unavailable') {
            this.logger.warn(
                `[cold-v2 queue] ${domain}: очередь портала не проверена (${lane.reason}) — окно переложено`,
            );
        }
        try {
            await job.queue.add(
                JobNames.EVENT_COLD_CALL_V2,
                { ...job.data, lane: wait },
                {
                    delay: XO_LANE_RETRY_DELAY_MS,
                    removeOnComplete: true,
                    removeOnFail: true,
                },
            );
            return true;
        } catch (error) {
            this.logger.error(
                `[cold-v2 queue] ${domain}: окно не переложено (${(error as Error).message}) — ` +
                    'обрабатываю без очереди портала',
                { telegram: true, domain },
            );
            return false;
        }
    }

    private nextWait(job: Job<IColdHookSilenceHandlerData>): IColdHookLaneWait {
        const previous = job.data.lane;
        return {
            retries: (previous?.retries ?? 0) + 1,
            firstQueuedAt: previous?.firstQueuedAt ?? job.timestamp,
            alerted: previous?.alerted ?? false,
        };
    }
}
