import { Injectable } from '@nestjs/common';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import {
    DealSendJobState,
    DealSendStatusResponseDto,
    DealSendWriteResultDto,
} from '../dto/deal-send.dto';

/** Состояние Bull → состояние для фронта. */
const STATE_OF: Record<string, DealSendJobState> = {
    waiting: 'waiting',
    paused: 'waiting',
    active: 'active',
    // попытка упала, задание ждёт повтора с паузой
    delayed: 'retrying',
    completed: 'completed',
    failed: 'failed',
};

/**
 * Статус записи сделки по operationId (= jobId в очереди
 * konstructor-deal-send). Задание хранится сутки после успеха и неделю
 * после отказа — потом not_found.
 */
@Injectable()
export class DealSendStatusUseCase {
    constructor(private readonly dispatcher: QueueDispatcherService) {}

    async execute(operationId: string): Promise<DealSendStatusResponseDto> {
        const job = await this.dispatcher.getJob(
            QueueNames.KONSTRUCTOR_DEAL_SEND,
            operationId,
        );
        if (!job) {
            return {
                operationId,
                state: 'not_found',
                done: true,
                ok: false,
                attemptsMade: 0,
                error: 'Задание не найдено: устарело или не создавалось',
                result: null,
            };
        }

        const state = STATE_OF[await job.getState()] ?? 'waiting';
        const done = state === 'completed' || state === 'failed';
        return {
            operationId,
            state,
            done,
            ok: state === 'completed',
            attemptsMade: job.attemptsMade,
            // Bull не очищает failedReason прошлой попытки — после успешного
            // повтора ошибки в ответе быть не должно
            error: state === 'completed' ? null : (job.failedReason ?? null),
            result:
                state === 'completed'
                    ? ((job.returnvalue as DealSendWriteResultDto | null) ??
                      null)
                    : null,
        };
    }
}
