import { Module } from '@nestjs/common';
import { SalesAiAnalyticsAdminController } from './sales-ai-analytics-admin.controller';
import { SalesAiAnalyticsAuditModule } from './sales-ai-analytics-audit.module';

/**
 * Админ-слой AI-аналитики ОП (план, 6.1): только контроллер поверх
 * SalesAiAnalyticsAuditModule. Подключать ТОЛЬКО в apps/admin — иначе
 * роуты admin/ai-analytics/* утекут в Swagger kpi-report-sales/event-sales
 * (ai/rules/app-api-surface.md). Защита — глобальные гарды @lib/auth плюс
 * явные @UseGuards в контроллере, роль SUPER_USER.
 */
@Module({
    imports: [SalesAiAnalyticsAuditModule],
    controllers: [SalesAiAnalyticsAdminController],
})
export class SalesAiAnalyticsAdminModule {}
