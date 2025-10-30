import { Body, Controller, Delete, Param, Post } from "@nestjs/common";
import { OrkUserReportGetRequestDto, OrkUserReportStartResponseDto } from "../dto/ork-user-report.dto";
import { OrkUserReportService } from "../services/ork-user-report.service";
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { OrkListHistoryItemDto } from "@/modules/ork-history-bx-list/dto/ork-list-history.dto";
import { QueueDispatcherService } from "@/modules/queue/dispatch/queue-dispatcher.service";
import { QueueNames } from "@/modules/queue/constants/queue-names.enum";
import { JobNames } from "@/modules/queue/constants/job-names.enum";
import { RedisService } from "@/core/redis/redis.service";





@ApiTags('Ork Report')
@Controller('ork-user-report')
export class UserReportController {
    constructor(
        private readonly orkUserReportService: OrkUserReportService,
        private readonly queue: QueueDispatcherService,
        readonly redis: RedisService,
    ) { }


    @ApiOperation({ summary: 'Get report' })
    @ApiBody({ type: OrkUserReportGetRequestDto })
    @ApiResponse({ status: 200, description: 'Report', type: OrkUserReportStartResponseDto })
    @Post()
    async start(@Body() body: OrkUserReportGetRequestDto) {
        const hash = this.hashBody(body); // Уникальный ключ задачи
        const existingJob = await this.queue.getJob(QueueNames.ORK_KPI_REPORT, hash);

        if (existingJob && (await existingJob.isActive() || await existingJob.isWaiting())) {
            return new OrkUserReportStartResponseDto(
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
        return new OrkUserReportStartResponseDto(
            job.id.toString() || '0',
            'User Report generation started for hash' + body.userId,
            true
        );
    }

    @ApiOperation({ summary: 'Stop report generation by operationId' })
    @ApiParam({ name: 'operationId', type: String })
    @ApiResponse({ status: 200, description: 'Report', type: OrkUserReportStartResponseDto })
    @Delete(':operationId')
    async stop(@Param('operationId') operationId: string): Promise<OrkUserReportStartResponseDto> {
        const redis = this.redis.getClient();
        const hash = await redis.get('ork-user-report-operation:' + operationId);
        console.log('operationId remove');
        console.log(operationId);
        console.log('hash');
        console.log(hash);


        const job = await this.queue.getJob(QueueNames.ORK_KPI_REPORT, operationId);
        if (!job) {
            return new OrkUserReportStartResponseDto(
                operationId,
                'Job not found or already completed',
                false
            );
        }

        await redis.del('ork-user-report-operation:' + operationId);
        await redis.del(hash || '');

        return new OrkUserReportStartResponseDto(
            operationId,
            `Job ${operationId} cancelled`,
            true
        );
    }
    @ApiOperation({ summary: 'Get report without ws', description: 'endpoint only for give types to frontend' })
    @ApiBody({ type: OrkUserReportGetRequestDto })
    @ApiResponse({ status: 200, description: 'Report', type: [OrkListHistoryItemDto] })
    @Post('without-ws')
    async getReportWithoutWs(@Body() body: OrkUserReportGetRequestDto): Promise<OrkListHistoryItemDto[]> {
        let list: OrkListHistoryItemDto[] = [];
        for await (const batch of this.orkUserReportService.getReport(body)) {
            list.push(...batch);
        }
        return list;
    }
    private hashBody(body: OrkUserReportGetRequestDto): string {
        return 'ork-user-report:' + Buffer.from(JSON.stringify(body)).toString('base64');
    }
}
