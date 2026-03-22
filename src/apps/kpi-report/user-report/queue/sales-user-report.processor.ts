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
}
@Processor(QueueNames.SALES_KPI_REPORT)
export class SalesUserReportQueueProcessor {
    onActive(job: Job) {
        console.log(
            `Processing job ${job.id} of type ${job.name} with data ${job.data}...`,
        );
    }
    private readonly logger = new Logger(QueueNames.SALES_KPI_REPORT);

    constructor(
        readonly redis: RedisService,
        private readonly ws: WsService, // WebSocket шлюз,
        private readonly service: SalesUserReportService,
    ) {
        this.logger.log('constructor SALES_KPI_REPORT_GENERATE');
    }

    @Process(JobNames.SALES_USER_REPORT_GENERATE)
    async handle(job: Job<SalesUserReportJobDataDto>) {
        const { userId, socketId, _hash, filters } = job.data;
        this.logger.log('SALES_KPI_REPORT_GENERATE');
        try {
            const redis = this.redis.getClient();

            let batchCount = 0;
            for await (const batch of this.service.getReport(job.data)) {
                const active = await redis.get(_hash);

                if (!active || active !== 'active') {
                    this.logger.warn(`Job ${job.id} not active — aborting job`);
                    await job.moveToFailed({ message: 'Job cancelled' }); // ❗ по желанию, можно просто return
                    return false;
                }

                // 🧩 Проверяем, жив ли сокет. Если нет, то удаляем задачу и выходим
                if (!this.ws.isConnected(socketId)) {
                    this.logger.warn(
                        `Socket ${socketId} disconnected — aborting job ${job.id}`,
                    );
                    await job.remove(); // ❗ по желанию, можно просто return
                    return false;
                }

                this.ws.sendToClient(socketId, {
                    event: SALES_USER_REPORT_EVENT.PROGRESS,
                    userId,
                    data: batch,
                });
                batchCount++;
            }

            this.ws.sendToClient(socketId, {
                event: SALES_USER_REPORT_EVENT.DONE,
                userId,
            });
            return true;
        } catch (error) {
            this.logger.error('Error SALES_KPI_REPORT_GENERATE');
            this.logger.error(error);
            return false;
        }
    }
}
