import { Body, Controller, Delete, Param, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { OrkListHistoryItemDto } from "@/modules/ork-history-bx-list/dto/ork-list-history.dto";
import { QueueDispatcherService } from "@/modules/queue/dispatch/queue-dispatcher.service";
import { QueueNames } from "@/modules/queue/constants/queue-names.enum";
import { JobNames } from "@/modules/queue/constants/job-names.enum";
import { RedisService } from "@/core/redis/redis.service";
import { SalesUserReportGetRequestDto, SalesUserReportStartResponseDto } from "../dto/sales-user-report.dto";
import { SalesUserReportService } from "../services/sales-user-report.service";





@ApiTags('Sales Report')
@Controller('sales-user-report')
export class SalesUserReportController {
    constructor(
        private readonly service: SalesUserReportService,
        private readonly queue: QueueDispatcherService,
        readonly redis: RedisService,
    ) { }


    @ApiOperation({ summary: 'Get report' })
    @ApiBody({ type: SalesUserReportGetRequestDto })
    @ApiResponse({ status: 200, description: 'Report', type: SalesUserReportStartResponseDto })
    @Post()
    async start(@Body() body: SalesUserReportGetRequestDto) {
        const hash = this.hashBody(body); // Уникальный ключ задачи
        const existingJob = await this.queue.getJob(QueueNames.ORK_KPI_REPORT, hash);

        if (existingJob && (await existingJob.isActive() || await existingJob.isWaiting())) {
            return new SalesUserReportStartResponseDto(
                existingJob.id.toString(),
                'Report already in progress for ' + body.userId,
                false
            );
        }
        const redis = this.redis.getClient();
        await redis.set(hash, 'active');
        await redis.expire(hash, 3600); // 1 hour TTL


        const job = await this.queue.dispatch(
            QueueNames.ORK_KPI_REPORT,
            JobNames.ORK_USER_REPORT_GENERATE,
            { ...body, _hash: hash },
            // hash
        );
        await redis.set('ork-user-report-operation:' + job.id.toString(), hash);
        await redis.expire('ork-user-report-operation:' + job.id.toString(), 3600); // 1 hour TTL
        return new SalesUserReportStartResponseDto(
            job.id.toString() || '0',
            'User Report generation started for hash' + body.userId,
            true
        );
    }

    @ApiOperation({ summary: 'Stop report generation by operationId' })
    @ApiParam({ name: 'operationId', type: String })
    @ApiResponse({ status: 200, description: 'Report', type: SalesUserReportStartResponseDto })
    @Delete(':operationId')
    async stop(@Param('operationId') operationId: string): Promise<SalesUserReportStartResponseDto> {
        const redis = this.redis.getClient();
        const hash = await redis.get('ork-user-report-operation:' + operationId);
        console.log('operationId remove');
        console.log(operationId);
        console.log('hash');
        console.log(hash);


        const job = await this.queue.getJob(QueueNames.ORK_KPI_REPORT, operationId);
        if (!job) {
            return new SalesUserReportStartResponseDto(
                operationId,
                'Job not found or already completed',
                false
            );
        }

        await redis.del('ork-user-report-operation:' + operationId);
        await redis.del(hash || '');

        return new SalesUserReportStartResponseDto(
            operationId,
            `Job ${operationId} cancelled`,
            true
        );
    }
    @ApiOperation({ summary: 'Get report without ws', description: 'endpoint only for give types to frontend' })
    @ApiBody({ type: SalesUserReportGetRequestDto })
    @ApiResponse({ status: 200, description: 'Report', type: [OrkListHistoryItemDto] })
    @Post('without-ws')
    async getReportWithoutWs(@Body() body: SalesUserReportGetRequestDto): Promise<OrkListHistoryItemDto[]> {
        let list: OrkListHistoryItemDto[] = [];
        for await (const batch of this.service.getReport(body)) {
            list.push(...batch);
        }
        return list;
    }
    private hashBody(body: SalesUserReportGetRequestDto): string {
        return 'sales-user-report:' + Buffer.from(JSON.stringify(body)).toString('base64');
    }
}
