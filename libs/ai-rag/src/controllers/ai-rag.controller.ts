import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LlmOrchestratorService } from '../application/llm-orchestrator.service';
import { AiRagRequestDto } from '../dto/ai-rag-request.dto';

@ApiTags('AI RAG')
@Controller('ai-rag')
export class AiRagController {
    constructor(private readonly llmOrchestrator: LlmOrchestratorService) {}

    @Post('resume')
    @ApiOperation({
        summary:
            'Сгенерировать резюме звонка от лица менеджера на основе ' +
            'корпоративной базы знаний.',
    })
    @ApiOkResponse({
        description: 'Готовое резюме звонка в формате { result, resultCode }.',
        type: String,
    })
    async resume(@Body() request: AiRagRequestDto): Promise<string> {
        return this.llmOrchestrator.resume(
            request.model,
            request.query,
            request.domain,
        );
    }

    @Post('recomendation')
    @ApiOperation({
        summary:
            'Сгенерировать рекомендации менеджеру по итогам звонка на основе ' +
            'корпоративной базы знаний.',
    })
    @ApiOkResponse({
        description: 'Готовые рекомендации в формате { result, resultCode }.',
        type: String,
    })
    async recomendation(@Body() request: AiRagRequestDto): Promise<string> {
        return this.llmOrchestrator.recomendation(
            request.model,
            request.query,
            request.domain,
        );
    }
}
