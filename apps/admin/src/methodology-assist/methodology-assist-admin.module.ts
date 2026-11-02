import { Module } from '@nestjs/common';
import { AiRagCoreModule } from '@lib/ai-rag';
import { LlmGatewayModule } from '@lib/llm-gateway';
import { MethodologyAssistController } from './controllers/methodology-assist.controller';
import { MethodologyAssistService } from './services/methodology-assist.service';

/**
 * Помощник брифа методики (`POST admin/methodologies/assist`) — только в
 * apps/admin: ему нужны шлюз моделей и загрузчик текста документов, которых
 * у call-lib нет (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [LlmGatewayModule, AiRagCoreModule],
    controllers: [MethodologyAssistController],
    providers: [MethodologyAssistService],
})
export class MethodologyAssistAdminModule {}
