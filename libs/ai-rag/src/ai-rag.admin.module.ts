import { Module } from '@nestjs/common';
import { AiRagModule } from './ai-rag.module';
import { AiRagKnowledgeAdminController } from './controllers/ai-rag-knowledge.admin.controller';

/**
 * Админ-модуль базы знаний RAG. Подключается ТОЛЬКО в apps/admin,
 * чтобы админ-роуты не попадали в Swagger прикладных приложений
 * (см. паттерн *AdminModule в call-lib / garant / portal).
 */
@Module({
    imports: [AiRagModule],
    controllers: [AiRagKnowledgeAdminController],
})
export class AiRagAdminModule {}
