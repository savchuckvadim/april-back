import { Module } from '@nestjs/common';
import { PortalRepository } from '@lib/portal-lib/store/portal.repository';
import { PortalPrismaRepository } from '@lib/portal-lib/store/portal.prisma.repository';
import { SupportMonitorAdminController } from './admin/support-monitor-admin.controller';
import { SupportGuideAdminController } from '../guide/admin/support-guide-admin.controller';
import { SupportGuideService } from '../guide/support-guide.service';
import { SupportMonitorModule } from './support-monitor.module';

/**
 * Админ-слой поддержки клиентов: предпросмотр монитора и путеводитель
 * раздела «Поддержка». Импортируется ТОЛЬКО в apps/admin
 * (ai/rules/app-api-surface.md), чтобы ручки не попали в Swagger apps/bot.
 *
 * PortalRepository — ради id портала линии в ссылках путеводителя
 * (Prisma — глобальный модуль приложения admin).
 */
@Module({
    imports: [SupportMonitorModule],
    controllers: [SupportMonitorAdminController, SupportGuideAdminController],
    providers: [
        { provide: PortalRepository, useClass: PortalPrismaRepository },
        SupportGuideService,
    ],
})
export class SupportMonitorAdminModule {}
