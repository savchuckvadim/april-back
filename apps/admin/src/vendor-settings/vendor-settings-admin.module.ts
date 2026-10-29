import { Module } from '@nestjs/common';
import { VendorSettingsModule } from '@lib/portal-lib/store/vendor-settings/vendor-settings.module';
import { VendorSettingsController } from './vendor-settings.controller';

/**
 * Админ-роуты настроек вендора (`admin/vendor-settings`) — только в
 * apps/admin, чтобы не торчать в Swagger прикладных приложений
 * (ai/rules/app-api-surface.md). Сервис — из глобального
 * VendorSettingsModule (portal-lib).
 */
@Module({
    imports: [VendorSettingsModule],
    controllers: [VendorSettingsController],
})
export class VendorSettingsAdminModule {}
