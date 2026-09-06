import { Injectable } from '@nestjs/common';
import { AiAnalyticsAuditService } from '@lib/sales-ai-analytics/admin/ai-analytics-audit.service';
import { AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS } from '../../constants/ai-analytics.const';
import { AiAuditSnapshotResult } from '../../dto/ai-snapshot.dto';
import { SettingsLoader } from '../loaders/settings.loader';

export interface AuditSnapshotInput {
    domain: string;
    /** Месяц запуска YYYY-MM (из jobId; в отчёт попадает окно от now). */
    monthKey: string;
}

/**
 * Месячный снапшот аудита данных (Фаза 0 → ais): окно
 * AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS месяцев в TZ портала, расчёт по живой
 * БД через AiAnalyticsAuditService (runAiAnalyticsAudit + PrismaAuditDb),
 * запись снапшота с source = cron. Тот же отчёт читает админка
 * (GET admin/ai-analytics/audit/latest).
 */
@Injectable()
export class AuditSnapshotUseCase {
    constructor(
        private readonly audit: AiAnalyticsAuditService,
        private readonly settings: SettingsLoader,
    ) {}

    async execute(
        input: AuditSnapshotInput,
        now = new Date(),
    ): Promise<AiAuditSnapshotResult> {
        const { calendar } = await this.settings.load(input.domain);
        const result = await this.audit.run(input.domain, {
            months: AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS,
            timeZone: calendar.timeZone,
            save: true,
            source: 'cron',
            now,
        });
        return {
            domain: input.domain,
            monthKey: input.monthKey,
            generatedAt: result.generatedAt,
            calls: result.report.totals.calls,
            analyzed: result.report.totals.analyzed,
        };
    }
}
