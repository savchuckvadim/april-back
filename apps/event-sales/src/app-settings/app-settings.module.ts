import { Module } from '@nestjs/common';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { AppSettingsController } from './app-settings.controller';

/**
 * Публичное чтение настроек приложений для фронтов event-sales
 * (GET /app-settings/:appCode?domain=…). Пишется только из админки.
 */
@Module({
    imports: [PortalAppSettingsModule],
    controllers: [AppSettingsController],
})
export class EventSalesAppSettingsModule {}
