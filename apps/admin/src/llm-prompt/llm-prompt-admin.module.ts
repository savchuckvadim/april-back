import { Module } from '@nestjs/common';
import { AiRagCoreModule } from '@lib/ai-rag';
import { LlmGatewayModule } from '@lib/llm-gateway';
import { LlmPromptController } from './controllers/llm-prompt.controller';
import { LlmPromptService } from './services/llm-prompt.service';

/**
 * Ручка «любой промпт любой моделью» (`admin/llm-prompt`) — только в
 * apps/admin, чтобы не торчать в Swagger прикладных приложений
 * (ai/rules/app-api-surface.md). Исполнители — шлюз разборов
 * (@lib/llm-gateway) и оркестратор контура резюме (@lib/ai-rag).
 */
@Module({
    imports: [LlmGatewayModule, AiRagCoreModule],
    controllers: [LlmPromptController],
    providers: [LlmPromptService],
})
export class LlmPromptAdminModule {}
