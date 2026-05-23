import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CallAnalysisUseCase } from '../use-cases/call-analysis.use-case';
import { TaskCompleteUseCase } from '../use-cases/task-complete.use-case';
import {
    AnalyzeActivityDto,
    AnalyzeDealCallsDto,
} from '../dto/call-analysis-request.dto';
import { CallSalesAnalysisDto } from '../dto/call-sales-analysis.dto';
import { TaskWebhookDto } from '../dto/task-webhook.dto';
import { TaskCompleteResultDto } from '../dto/task-complete-result.dto';

@ApiTags('AI-анализ звонков')
@Controller('call-analysis')
export class CallAnalysisController {
    constructor(
        private readonly useCase: CallAnalysisUseCase,
        private readonly taskCompleteUseCase: TaskCompleteUseCase,
    ) {}

    @Post('deal')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Анализировать последние звонки по сделке' })
    @ApiOkResponse({
        description: 'Массив результатов анализа по каждому найденному звонку',
        type: CallSalesAnalysisDto,
        isArray: true,
    })
    analyzeDeal(
        @Body() dto: AnalyzeDealCallsDto,
    ): Promise<CallSalesAnalysisDto[]> {
        return this.useCase.forDeal(dto);
    }

    @Post('activity')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Анализировать конкретную активность-звонок' })
    @ApiOkResponse({
        description: 'Результат анализа одного звонка',
        type: CallSalesAnalysisDto,
    })
    analyzeActivity(
        @Body() dto: AnalyzeActivityDto,
    ): Promise<CallSalesAnalysisDto> {
        return this.useCase.forActivity(dto);
    }

    @Post('webhook/task-complete')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary:
            'Webhook Bitrix ONTASKUPDATE: при закрытии задачи подтверждения подтягиваем сохранённый flowDto и шлём в event-sales',
    })
    @ApiOkResponse({
        description:
            'Результат обработки webhook: подтянутый flowDto если задача закрыта',
        type: TaskCompleteResultDto,
    })
    onTaskComplete(
        @Body() webhook: TaskWebhookDto,
    ): Promise<TaskCompleteResultDto> {
        return this.taskCompleteUseCase.handle(webhook);
    }
}
