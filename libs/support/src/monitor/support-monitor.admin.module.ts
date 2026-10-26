import { Module } from '@nestjs/common';
import { SupportMonitorAdminController } from './admin/support-monitor-admin.controller';
import { SupportMonitorModule } from './support-monitor.module';

/**
 * Админ-слой монитора поддержки: только контроллер предпросмотра.
 * Импортируется ТОЛЬКО в apps/admin (ai/rules/app-api-surface.md), чтобы
 * ручка не попала в Swagger apps/bot и других приложений.
 */
@Module({
    imports: [SupportMonitorModule],
    controllers: [SupportMonitorAdminController],
})
export class SupportMonitorAdminModule {}
