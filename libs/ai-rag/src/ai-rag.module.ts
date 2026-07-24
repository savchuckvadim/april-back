import { Module } from '@nestjs/common';
import { AiRagCoreModule } from './ai-rag-core.module';
import { AiRagController } from './controllers/ai-rag.controller';
import { AiRagKnowledgeController } from './controllers/ai-rag-knowledge.controller';

/**
 * Полный модуль ai-rag: сервисное ядро (AiRagCoreModule) + публичные
 * контроллеры /ai-rag/*. Для приложений, которым нужны только сервисы
 * без роутов (клиентский кабинет), импортируйте AiRagCoreModule.
 */
@Module({
    imports: [AiRagCoreModule],
    controllers: [AiRagController, AiRagKnowledgeController],
    exports: [AiRagCoreModule],
})
export class AiRagModule {}
