import { ConfigService } from '@nestjs/config';
import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { AiRagCoreModule } from '../ai-rag-core.module';

/**
 * Ядро ai-rag приходит в приложения транзитивно (через @lib/llm-gateway),
 * поэтому обязано само тянуть всё, что нужно его провайдерам. Глобально
 * в каждом приложении есть только ConfigService (ConfigModule.forRoot).
 * Боевой случай 29.10.2026: bot не стартовал без StorageService.
 */
describe('DI-граф AiRagCoreModule', () => {
    it('все зависимости провайдеров доступны без помощи приложения', () => {
        expect(
            findMissingModuleDependencies(AiRagCoreModule, [ConfigService]),
        ).toEqual([]);
    });
});
