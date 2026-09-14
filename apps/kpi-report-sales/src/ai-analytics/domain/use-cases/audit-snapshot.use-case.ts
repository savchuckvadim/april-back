import { Injectable } from '@nestjs/common';
import { minDurationFloorSec } from '@lib/sales-ai-analytics';
import { AiAnalyticsAuditService } from '@lib/sales-ai-analytics/admin/ai-analytics-audit.service';
import { AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS } from '../../constants/ai-analytics.const';
import { AiAuditSnapshotResult } from '../../dto/ai-snapshot.dto';
import { portalMinDurationByType } from '../loaders/min-duration.util';
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
 *
 * Порог «короткого» звонка отчёта — портальный (min_duration_sec_by_type),
 * а не константа правил аудита: у пульса, конвейера разбора и аудита Фазы 0
 * обязан быть один порог (находка M12 аудита Фазы 2).
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
        const settings = await this.settings.load(input.domain);
        const result = await this.audit.run(input.domain, {
            months: AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS,
            timeZone: settings.calendar.timeZone,
            save: true,
            source: 'cron',
            now,
            // Порог «короткого» — тот же, что у пульса и ночного конвейера
            // (решение владельца А.1): карта min_duration_sec_by_type
            // портала, минимум по ней (тип звонка в долю коротких аудита не
            // входит). Настройки уже прочитаны здесь — сервис их не перечитывает.
            shortCallSec: minDurationFloorSec(
                portalMinDurationByType(settings),
            ),
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
