import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiRagCoreModule } from '@lib/ai-rag';
import { EgressProxyModule } from '@lib/egress-proxy';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { VibecodeModule } from '@lib/vibecode';
import { AiRagStructuredAdapter } from './adapters/ai-rag-structured.adapter';
import { OpenAiCompatibleStructuredAdapter } from './adapters/openai-compatible-structured.adapter';
import { VibecodeStructuredAdapter } from './adapters/vibecode-structured.adapter';
import { LlmCircuitBreakerService } from './llm-circuit-breaker.service';
import { LlmEndpointResolverService } from './llm-endpoint-resolver.service';
import { LlmGatewaySettingsService } from './llm-gateway-settings.service';
import { LlmProviderOrderResolver } from './llm-provider-order.resolver';
import { StructuredLlmGateway } from './structured-llm.gateway';

/**
 * Шлюз структурных LLM-вызовов (@lib/llm-gateway): потребитель импортирует
 * модуль и инжектит `StructuredLlmGateway` вместо `VibeCodeClient` +
 * `VibeKeyResolverService`. Провайдеры: VibeCode (ключ портала из БД),
 * любой OpenAI-совместимый endpoint (креды портала или свой запасной
 * поставщик из «Настроек приложения») и модели оркестратора контура 1
 * (`ai-rag`, по явному порядку); порядок — env LLM_PROVIDER_ORDER;
 * предохранитель — в Redis. Пределы очереди к VibeCode, сроки ответа и
 * пороги предохранителя — «Настройки приложения» в админке
 * (LlmGatewaySettingsService; env с тем же именем — запасной путь).
 * Подробности — README.md библиотеки.
 */
@Module({
    imports: [
        ConfigModule,
        VibecodeModule,
        PortalStoreModule,
        RedisModule,
        AiRagCoreModule,
        // Зарубежные OpenAI-совместимые endpoint'ы — через исходящий прокси
        EgressProxyModule,
    ],
    providers: [
        LlmGatewaySettingsService,
        LlmCircuitBreakerService,
        LlmEndpointResolverService,
        LlmProviderOrderResolver,
        VibecodeStructuredAdapter,
        OpenAiCompatibleStructuredAdapter,
        AiRagStructuredAdapter,
        StructuredLlmGateway,
    ],
    exports: [
        StructuredLlmGateway,
        LlmGatewaySettingsService,
        LlmCircuitBreakerService,
        LlmEndpointResolverService,
        LlmProviderOrderResolver,
    ],
})
export class LlmGatewayModule {}
