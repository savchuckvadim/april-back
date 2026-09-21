import { Module } from '@nestjs/common';
import { PrismaModule } from '@lib/core/prisma/prisma.module';
import { AiModule } from '@lib/call-lib';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { AiAnalyticsAuditSnapshotStore } from './ai-analytics-audit-snapshot.store';
import { AiAnalyticsAuditService } from './ai-analytics-audit.service';

/**
 * Сервисный модуль аудита данных AI-аналитики: стор снапшотов в ais и
 * сервис запуска по живой БД — без контроллеров (ai/rules/app-api-surface.md).
 * Импортируют и SalesAiAnalyticsAdminModule (ручки в apps/admin), и
 * AiAnalyticsModule kpi-report-sales (месячный снапшот по крону).
 */
@Module({
    // PortalAppSettingsModule — сервисный (без контроллеров): признак
    // ai_analytics_audit_enabled портала.
    // PortalStoreModule — старая админка разбора (запасной скаляр порога);
    // модуль без контроллеров, поверхность API админки не растёт.
    imports: [
        PrismaModule,
        AiModule,
        PortalAppSettingsModule,
        PortalStoreModule,
    ],
    providers: [AiAnalyticsAuditSnapshotStore, AiAnalyticsAuditService],
    exports: [AiAnalyticsAuditSnapshotStore, AiAnalyticsAuditService],
})
export class SalesAiAnalyticsAuditModule {}
