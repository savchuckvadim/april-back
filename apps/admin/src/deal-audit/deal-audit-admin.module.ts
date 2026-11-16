import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AdminPortalModule } from '../portal/portal.module';
import { DealAuditAdminController } from './controllers/deal-audit-admin.controller';
import { DealAuditRunNowAdminService } from './services/deal-audit-run-now-admin.service';

/**
 * Админ-поверхность аудита сделок (только apps/admin — правило
 * app-api-surface): кнопка «Сформировать и отправить». Админка лишь
 * ставит джоб; воркер очереди и сам аудит — в apps/event-sales.
 */
@Module({
    imports: [QueueModule, PortalAppSettingsModule, AdminPortalModule],
    controllers: [DealAuditAdminController],
    providers: [DealAuditRunNowAdminService],
})
export class DealAuditAdminModule {}
