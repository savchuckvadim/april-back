import { Module } from '@nestjs/common';
import { AiRagCoreModule } from '@lib/ai-rag';
import { KnowledgeMaterialsService } from './services/knowledge-materials.service';

/**
 * Материалы базы знаний по ролям: скрипт, регламент, факты о продукте,
 * плейбуки, эталоны (Фаза 2 плана ai/tasks/rag-driven-analysis-plan.md).
 *
 * Ядро без контроллеров — потребители (конвейер разбора, пост-анализ)
 * получают только сервис, роуты /ai-rag/* наружу не текут.
 */
@Module({
    imports: [AiRagCoreModule],
    providers: [KnowledgeMaterialsService],
    exports: [KnowledgeMaterialsService],
})
export class KnowledgeMaterialsModule {}
