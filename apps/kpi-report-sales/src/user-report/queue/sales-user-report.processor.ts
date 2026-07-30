import { Process, Processor } from '@nestjs/bull';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';

import { JobNames } from 'src/modules/queue/constants/job-names.enum';
import { Job } from 'bull';

import { WsService } from 'src/core/ws';
import { Logger } from '@nestjs/common';

import { RedisService } from '@/core/redis/redis.service';
import { SalesUserReportJobDataDto } from '../dto/sales-user-report.dto';
import { SalesUserReportService } from '../services/sales-user-report.service';
export enum SALES_USER_REPORT_EVENT {
    PROGRESS = 'sales-user-report:progress',
    DONE = 'sales-user-report:done',
    ERROR = 'sales-user-report:error',
}
@Processor(QueueNames.SALES_KPI_REPORT)
export class SalesUserReportQueueProcessor {
    private readonly logger = new Logger(SalesUserReportQueueProcessor.name);

    constructor(
        readonly redis: RedisService,
        private readonly ws: WsService, // WebSocket шлюз,
        private readonly service: SalesUserReportService,
    ) {}

    @Process(JobNames.SALES_USER_REPORT_GENERATE)
    async handle(job: Job<SalesUserReportJobDataDto>): Promise<boolean> {
        const { userId, socketId, _hash } = job.data;
        this.logger.log('SALES_USER_REPORT_GENERATE');
        try {
            const redis = this.redis.getClient();

            for await (const batch of this.service.getReport(job.data)) {
                const active = await redis.get(_hash);

                if (!active || active !== 'active') {
                    this.logger.warn(`Job ${job.id} not active — aborting job`);
                    await job.moveToFailed({ message: 'Job cancelled' });
                    return false;
                }

                // Сокет умер — стриминг некому доставлять, снимаем задачу.
                if (!this.ws.isConnected(socketId)) {
                    this.logger.warn(
                        `Socket ${socketId} disconnected — aborting job ${job.id}`,
                    );
                    await job.remove();
                    return false;
                }

                this.ws.sendToClient(socketId, {
                    event: SALES_USER_REPORT_EVENT.PROGRESS,
                    userId,
                    data: batch,
                });
            }

            this.ws.sendToClient(socketId, {
                event: SALES_USER_REPORT_EVENT.DONE,
                userId,
            });
            return true;
        } catch (error) {
            // Раньше ошибка глоталась (return false) — job числился успешным,
            // фронт ждал done вечно. Теперь: громкое событие + rethrow.
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.error(`SALES_USER_REPORT_GENERATE упал: ${message}`);
            this.ws.sendToClient(socketId, {
                event: SALES_USER_REPORT_EVENT.ERROR,
                userId,
                data: { message },
            });
            throw error;
        }
    }
}
