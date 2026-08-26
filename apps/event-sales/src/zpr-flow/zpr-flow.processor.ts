import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { WsService } from '@/core/ws';
import { ZprFlowService } from './zpr-flow.service';
import { ZprFlowJobData } from './dto/zpr-flow-job.dto';
import {
    ZPR_FLOW_WS_EVENTS,
    ZprFlowDonePayload,
} from './constants/zpr-flow.const';

/**
 * Воркер сайд-очереди ЗПР. Ошибка джоба логируется и НЕ ретраится вечно
 * (джоб ставится без retry): элемент смарта — дополнение к отчёту, а не
 * его условие; потерянный элемент виден по логу и восстановим руками.
 *
 * По успеху шлёт `zpr-flow:done` ТОЧЕЧНО в socketId клиента (как основной
 * flow) — фронт по нему перечитывает слайс ЗПР. Комнат/broadcast по userId
 * нет намеренно: id юзера уникален только в рамках портала.
 *
 * Concurrency остаётся 1 (в отличие от основного flow, где 4 + лок по
 * клиенту): один отчёт может поставить ДВА джоба — сначала закрыть текущий
 * элемент, потом создать следующий, — и порядок между ними обязателен.
 * Параллельный воркер создал бы новый элемент раньше, чем закрылся старый,
 * и «открытым» для следующего отчёта оказался бы не тот. Джобы лёгкие
 * (1–3 вызова), очередь не копится.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_ZPR_FLOW)
export class ZprFlowProcessor {
    private readonly logger = new Logger(ZprFlowProcessor.name);

    constructor(
        private readonly service: ZprFlowService,
        private readonly ws: WsService,
    ) {
        this.logger.log('ZprFlowProcessor initialized');
    }

    @Process(JobNames.EVENT_SALES_ZPR_FLOW)
    async handle(job: Job<ZprFlowJobData>): Promise<void> {
        try {
            const result = await this.service.handle(job.data);
            if (job.data.socketId && result.action !== 'skipped') {
                const payload: ZprFlowDonePayload = {
                    ...result,
                    domain: job.data.domain,
                    operationId: job.data.operationId,
                    kind: job.data.kind,
                };
                this.ws.sendToClient(job.data.socketId, {
                    event: ZPR_FLOW_WS_EVENTS.DONE,
                    data: payload,
                });
            }
        } catch (error) {
            this.logger.error(
                `[zpr-flow] джоб ${job.id} (${job.data.domain}, op=${job.data.operationId ?? '-'}) упал: ${(error as Error).message}`,
            );
        }
    }
}
