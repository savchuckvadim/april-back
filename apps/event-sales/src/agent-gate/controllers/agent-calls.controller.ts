import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBody,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    AGENT_API_KEY_HEADER,
    AgentKeyGuard,
    AgentRequest,
} from '../guards/agent-key.guard';
import { AgentCallPackageService } from '../services/agent-call-package.service';
import { AgentAnalysisIntakeService } from '../services/agent-analysis-intake.service';
import { AgentCallsQueryDto } from '../dto/agent-query.dto';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import {
    AgentAnalysisResponseDto,
    AgentCallPackageDto,
    AgentPendingCallDto,
} from '../dto/agent-response.dto';

/**
 * Agent API: данные звонков для внешнего агента-аналитика
 * (OpenClaw / claude-code) и приём его результатов.
 * Доступ — по ключу агента (env AGENT_API_KEYS).
 */
@ApiTags('Agent API')
@ApiHeader({
    name: AGENT_API_KEY_HEADER,
    description: 'Ключ внешнего агента (env AGENT_API_KEYS).',
    required: true,
})
@UseGuards(AgentKeyGuard)
@Controller('agent/calls')
export class AgentCallsController {
    constructor(
        private readonly packageService: AgentCallPackageService,
        private readonly intakeService: AgentAnalysisIntakeService,
    ) {}

    @Get()
    @ApiOperation({
        summary: 'Звонки, ожидающие анализа',
        description:
            'Обработанные конвейером звонки (транскрипт + GigaChat готовы), по которым ' +
            'ещё нет глубокого анализа агента.',
    })
    @ApiOkResponse({
        type: [AgentPendingCallDto],
        description: 'Список звонков для анализа, новые первыми.',
    })
    async listPending(
        @Query() query: AgentCallsQueryDto,
        @Req() request: AgentRequest,
    ): Promise<AgentPendingCallDto[]> {
        return this.packageService.listPendingScoped(
            query.domain,
            query.limit ?? 20,
            request.agentDomains,
        );
    }

    @Get(':transcriptionId')
    @ApiOperation({
        summary: 'Пакет данных по звонку',
        description:
            'Полный контекст для анализа: транскрипт, первичные AI-результаты, сделка/' +
            'компания/контакт из Bitrix и кандидаты записей отчётов из sales_history.',
    })
    @ApiParam({
        name: 'transcriptionId',
        description: 'ID транскрипции из списка ожидающих звонков.',
        example: '42',
        type: String,
    })
    @ApiOkResponse({
        type: AgentCallPackageDto,
        description: 'Пакет данных по звонку.',
    })
    async getPackage(
        @Param('transcriptionId') transcriptionId: string,
        @Req() request: AgentRequest,
    ): Promise<AgentCallPackageDto> {
        return this.packageService.getPackage(
            transcriptionId,
            request.agentDomains,
        );
    }

    @Post(':transcriptionId/analysis')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Push-back анализа агента',
        description:
            'Принимает результат глубокого анализа звонка: сохраняет в ais и создаёт ' +
            'элемент смарт-процесса «AI-анализ звонков» со всеми связями. Если смарт ' +
            'не установлен — анализ сохраняется только в БД.',
    })
    @ApiParam({
        name: 'transcriptionId',
        description: 'ID транскрипции анализируемого звонка.',
        example: '42',
        type: String,
    })
    @ApiBody({
        type: AgentCallAnalysisDto,
        description: 'Структурированный результат анализа агента.',
    })
    @ApiOkResponse({
        type: AgentAnalysisResponseDto,
        description: 'ID записи ais и созданного смарт-элемента.',
    })
    async pushAnalysis(
        @Param('transcriptionId') transcriptionId: string,
        @Body() dto: AgentCallAnalysisDto,
        @Req() request: AgentRequest,
    ): Promise<AgentAnalysisResponseDto> {
        return this.intakeService.intake(
            transcriptionId,
            request.agentName,
            dto,
            request.agentDomains,
        );
    }
}
