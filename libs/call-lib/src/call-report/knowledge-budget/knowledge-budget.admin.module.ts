import { Module } from '@nestjs/common';
import { AiRagCoreModule } from '@lib/ai-rag';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { CallTypeRegistryModule } from '../call-type-registry.module';
import { MethodologyModule } from '../methodology/methodology.module';
import { KnowledgeBudgetAdminController } from './knowledge-budget.admin.controller';
import { KnowledgeBudgetReportService } from './knowledge-budget-report.service';

/**
 * Админ-слой сводки бюджетов базы знаний (`admin/call-report/knowledge-budget`).
 * Подключать в apps/admin, а не в event-sales (ai/rules/app-api-surface.md):
 * сам разбор берёт бюджеты из той же таблицы напрямую, без этого модуля.
 */
@Module({
    imports: [
        AiRagCoreModule,
        CallTypeRegistryModule,
        MethodologyModule,
        PortalStoreModule,
    ],
    controllers: [KnowledgeBudgetAdminController],
    providers: [KnowledgeBudgetReportService],
})
export class KnowledgeBudgetAdminModule {}
