import { Module } from '@nestjs/common';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { KonstructorAppSettingsController } from './app-settings.controller';

/** Чтение портальных настроек приложения фреймом конструктора (GET app-settings/:appCode). */
@Module({
    imports: [PortalAppSettingsModule],
    controllers: [KonstructorAppSettingsController],
})
export class KonstructorAppSettingsModule {}
