import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EgressProxyModule } from '@lib/egress-proxy';
import { LlmGatewayModule } from '@lib/llm-gateway';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { VibecodeModule } from '@lib/vibecode';
import { PortalAiProvidersController } from './controllers/ai-providers.controller';
import { AiEndpointProbeService } from './services/ai-endpoint-probe.service';
import { PortalAiProvidersReadinessService } from './services/ai-providers-readiness.service';

/**
 * Чек-лист готовности провайдеров AI портала (`admin/portal/:portalId/ai-providers`).
 * Живёт в apps/admin, а не в библиотеке: ему нужны сразу шлюз LLM
 * (@lib/llm-gateway) и настройки транскрибации (@lib/call-lib), которые друг
 * друга не импортируют. Yandex-модули не поднимаются — «что действует» для
 * транскрибации считается чистыми функциями call-lib по настройкам и env.
 */
@Module({
    imports: [
        ConfigModule,
        PortalStoreModule,
        LlmGatewayModule,
        VibecodeModule,
        EgressProxyModule,
    ],
    controllers: [PortalAiProvidersController],
    providers: [PortalAiProvidersReadinessService, AiEndpointProbeService],
})
export class PortalAiProvidersAdminModule {}
