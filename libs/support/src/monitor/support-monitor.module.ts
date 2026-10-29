import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EgressProxyModule } from '@lib/egress-proxy';
import { PBXModule } from '@lib/pbx';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { SupportMonitorSettingsService } from './application/support-monitor-settings.service';
import { SupportMonitorTickService } from './application/support-monitor-tick.service';
import { SupportSignalDispatcher } from './application/support-signal.dispatcher';
import { SupportMonitorStore } from './infrastructure/support-monitor.store';
import { SupportTelegramNotifier } from './infrastructure/support-telegram.notifier';

/**
 * Мониторинг линии поддержки — ТОЛЬКО сервисы, без контроллеров
 * (ai/rules/app-api-surface.md). Крон живёт в apps/bot, предпросмотр —
 * в {@link SupportMonitorAdminModule} (apps/admin).
 *
 * RedisModule и PortalAppSettingsModule не глобальные — импортируются явно
 * (иначе UnknownDependenciesException на старте приложения).
 */
@Module({
    imports: [
        ConfigModule,
        HttpModule,
        PBXModule,
        RedisModule,
        PortalAppSettingsModule,
        // Бот поддержки ходит в api.telegram.org через исходящий прокси (env EGRESS_PROXY_*)
        EgressProxyModule,
    ],
    providers: [
        SupportMonitorStore,
        SupportTelegramNotifier,
        SupportSignalDispatcher,
        SupportMonitorTickService,
        SupportMonitorSettingsService,
    ],
    exports: [
        SupportMonitorStore,
        SupportMonitorTickService,
        SupportMonitorSettingsService,
        SupportTelegramNotifier,
    ],
})
export class SupportMonitorModule {}
