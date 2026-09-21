import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { StageHistoryProbeService } from './stage-history-probe.service';

/**
 * Сервисный модуль проб портала для админки AI-аналитики: сейчас — проба
 * истории стадий сделок (crm.stagehistory.list) через PBXService.
 *
 * ⚠ Импортировать ТОЛЬКО в SalesAiAnalyticsAdminModule (apps/admin) и НЕ
 * в SalesAiAnalyticsAuditModule: тот подключён в kpi-report-sales, и вместе
 * с пробой туда утекло бы всё поддерево PBXModule (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [PBXModule],
    providers: [StageHistoryProbeService],
    exports: [StageHistoryProbeService],
})
export class SalesAiAnalyticsProbeModule {}
