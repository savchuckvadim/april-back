import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { OwnerReportUseCase } from '../domain/use-cases/owner-report.use-case';
import {
    AiOwnerReportRequestDto,
    AiOwnerReportResponseDto,
} from '../dto/ai-owner-report.dto';

@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class AiAnalyticsOwnerReportController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly ownerReport: OwnerReportUseCase,
    ) {}

    @PortalSessionProtected()
    @Post('owner-report')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отчёт собственнику за период (очередь + WS)',
        description:
            'Управленческий отчёт по отделу продаж за закрытый месяц, квартал, ' +
            'полугодие или год: исходы разговоров, конверсии по типам, недели, ' +
            'где теряем продажи, как управляется отдел, возражения, сбои, ' +
            'метрики контроля, сотрудники, методология. Только руководители ' +
            'cup|op. Ключ результата — ' +
            'sales-ai-analytics:v1:{domain}:owner-report:v1:{kind}:{periodKey}: ' +
            'попадание в кэш или готовый снапшот → ready; расчёт идёт → ' +
            'processing; промах → джоба SALES_AI_ANALYTICS_OWNER_REPORT ' +
            '(jobId = requestKey) → queued, по завершении WS ' +
            'ai-analytics:owner-report:done|error с requestKey — затем ' +
            'повторить POST. forceRefresh пересобирает. Текст резюме, утечек ' +
            'и карточек сотрудников пишет модель поверх шаблона с факт-чеком ' +
            'чисел; без модели приходит шаблон (source = template).',
    })
    @ApiBody({ type: AiOwnerReportRequestDto })
    @ApiOkResponse({
        type: AiOwnerReportResponseDto,
        description:
            'Конверт: при ready — отчёт в data; при queued/processing — ' +
            'дождаться WS и повторить POST; при error — текст в message.',
    })
    async get(
        @Body() dto: AiOwnerReportRequestDto,
    ): Promise<AiOwnerReportResponseDto> {
        const access = await this.access.resolve(
            dto.domain,
            dto.requesterUserId,
        );
        this.access.assertLeader(access, AI_ANALYTICS_ADMIN_ROLES);
        const lookup = await this.ownerReport.lookup(dto);
        switch (lookup.status) {
            case 'ready':
                return {
                    status: 'ready',
                    requestKey: lookup.requestKey,
                    data: lookup.data,
                };
            case 'error':
                return {
                    status: 'error',
                    requestKey: lookup.requestKey,
                    message: lookup.message,
                };
            default:
                return {
                    status: lookup.status,
                    requestKey: lookup.requestKey,
                    jobId: lookup.jobId,
                };
        }
    }
}
