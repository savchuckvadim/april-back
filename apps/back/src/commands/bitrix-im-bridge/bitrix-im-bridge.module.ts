import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PBXModule } from '@/modules/pbx';
import { RedisModule } from '@/core/redis/redis.module';
import { TelegramChatBotModule } from '@/modules/telegram-chat-bot';
import { BridgeOrchestratorService } from './services/bridge-orchestrator.service';
import { BitrixImBridgeStateService } from './services/bitrix-im-bridge-state.service';
import { TelegramBridgeService } from './services/telegram-bridge.service';
import { BitrixImBridgeConfigService } from './services/config/bitrix-im-bridge-config.service';
import { BitrixImApiService } from './services/bitrix/bitrix-im-api.service';
import { BridgeUserResolverService } from './services/bitrix/bridge-user-resolver.service';
import { BridgeUserNameCacheService } from './services/bitrix/bridge-user-name-cache.service';
import { BitrixImEventFilterService } from './services/filters/bitrix-im-event-filter.service';
import { BitrixImEventDataService } from './services/parsers/bitrix-im-event-data.service';
import { TelegramReplyRouterService } from './services/telegram/telegram-reply-router.service';
import { BitrixImBridgeCronService } from './services/cron/bitrix-im-bridge-cron.service';
import { BitrixImBridgeController } from './controllers/bitrix-im-bridge.controller';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { StartBridgeUseCase } from './usecases/start-bridge.use-case';
import { PollDomainUseCase } from './usecases/poll-domain.use-case';
import { HandleTelegramWebhookUseCase } from './usecases/handle-telegram-webhook.use-case';
import { PollScheduledDomainsUseCase } from './usecases/poll-scheduled-domains.use-case';

@Module({
    imports: [
        PBXModule,
        RedisModule,
        ConfigModule,
        PortalStoreModule,
        TelegramChatBotModule,
    ],
    controllers: [BitrixImBridgeController],
    providers: [
        BridgeOrchestratorService,
        BitrixImBridgeStateService,
        TelegramBridgeService,
        BitrixImBridgeConfigService,
        BitrixImApiService,
        BridgeUserResolverService,
        BridgeUserNameCacheService,
        BitrixImEventFilterService,
        BitrixImEventDataService,
        TelegramReplyRouterService,
        BitrixImBridgeCronService,
        StartBridgeUseCase,
        PollDomainUseCase,
        HandleTelegramWebhookUseCase,
        PollScheduledDomainsUseCase,
    ],
})
export class BitrixImBridgeModule {}
