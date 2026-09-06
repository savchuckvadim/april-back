import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    AI_ANALYTICS_AUDIT_ABOUT,
    AiAnalyticsAuditAbout,
} from '../audit/ai-analytics-audit.about';
import { PrismaAuditDb } from '../audit/ai-analytics-audit.db';
import { AuditReport } from '../audit/ai-analytics-audit.report';
import { runAiAnalyticsAudit } from '../audit/ai-analytics-audit.run';
import { AiAnalyticsAuditSource } from '../contracts/audit-snapshot.types';
import { AiAnalyticsAuditSnapshotStore } from './ai-analytics-audit-snapshot.store';

export interface AiAnalyticsAuditRunOptions {
    months: number;
    timeZone: string;
    /** Сохранить снапшот в ais. */
    save: boolean;
    source: AiAnalyticsAuditSource;
    /** Момент запуска (по умолчанию сейчас; в тестах — фиксированный). */
    now?: Date;
}

export interface AiAnalyticsAuditResult {
    domain: string;
    /** ISO (UTC). */
    generatedAt: string;
    months: number;
    timeZone: string;
    fromSnapshot: boolean;
    source: AiAnalyticsAuditSource;
    markdown: string;
    report: AuditReport;
    /** Самоописание: что считалось и как читать (то же, что в Swagger/README). */
    about: AiAnalyticsAuditAbout;
}

/** Состояние признака аудита на портале + дата последнего снапшота. */
export interface AiAnalyticsAuditPortalStatus {
    domain: string;
    /** AI-аналитика ОП включена на портале (ai_analytics_enabled). */
    aiAnalyticsEnabled: boolean;
    /** Аудит и калибровка данных разрешены (ai_analytics_audit_enabled). */
    auditEnabled: boolean;
    lastSnapshotAt: string | null;
}

/**
 * Аудит данных AI-аналитики по живой БД приложения: PrismaService →
 * PrismaAuditDb → runAiAnalyticsAudit (lib), опционально снапшот в ais.
 * Один код для админ-ручки (source = admin) и месячного крона
 * kpi-report-sales (source = cron). Bitrix не трогает — только БД.
 *
 * Запуск разрешён только порталам с признаком kpi-sales
 * `ai_analytics_audit_enabled` («Аудит и калибровка данных разрешены»):
 * без него — ForbiddenException с подсказкой, где включить. Чтение
 * последнего снапшота признаком не ограничено.
 */
@Injectable()
export class AiAnalyticsAuditService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly snapshots: AiAnalyticsAuditSnapshotStore,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    async run(
        domain: string,
        options: AiAnalyticsAuditRunOptions,
    ): Promise<AiAnalyticsAuditResult> {
        await this.assertAllowed(domain);
        const { months, timeZone, source } = options;
        const { report, markdown, generatedAt } = await runAiAnalyticsAudit(
            new PrismaAuditDb(this.prisma),
            { domain, months, timeZone, now: options.now ?? new Date() },
        );
        if (options.save) {
            await this.snapshots.save({
                domain,
                markdown,
                payload: { report, months, timeZone, generatedAt, source },
            });
        }
        return {
            domain,
            generatedAt,
            months,
            timeZone,
            fromSnapshot: false,
            source,
            markdown,
            report,
            about: AI_ANALYTICS_AUDIT_ABOUT,
        };
    }

    /** Последний снапшот домена из ais; null — снапшотов ещё нет. */
    async latest(domain: string): Promise<AiAnalyticsAuditResult | null> {
        const snapshot = await this.snapshots.latest(domain);
        if (!snapshot) return null;
        return {
            domain,
            generatedAt: snapshot.generatedAt,
            months: snapshot.months,
            timeZone: snapshot.timeZone,
            fromSnapshot: true,
            source: snapshot.source,
            markdown: snapshot.markdown,
            report: snapshot.report,
            about: AI_ANALYTICS_AUDIT_ABOUT,
        };
    }

    /** Признак разрешения аудита и дата последнего снапшота портала. */
    async status(domain: string): Promise<AiAnalyticsAuditPortalStatus> {
        const [settings, snapshot] = await Promise.all([
            this.appSettings.resolve(domain, EnumPortalAppCode.kpiSales),
            this.snapshots.latest(domain),
        ]);
        return {
            domain,
            aiAnalyticsEnabled: settings.aiAnalyticsEnabled,
            auditEnabled: settings.aiAnalyticsAuditEnabled,
            lastSnapshotAt: snapshot?.generatedAt ?? null,
        };
    }

    private async isAllowed(domain: string): Promise<boolean> {
        const settings = await this.appSettings.resolve(
            domain,
            EnumPortalAppCode.kpiSales,
        );
        return settings.aiAnalyticsAuditEnabled;
    }

    private async assertAllowed(domain: string): Promise<void> {
        if (await this.isAllowed(domain)) return;
        throw new ForbiddenException(
            `Аудит данных по порталу ${domain} не разрешён: включите признак ` +
                '«Аудит и калибровка данных AI-аналитики разрешены» ' +
                '(ai_analytics_audit_enabled) в настройках приложения kpi-sales портала',
        );
    }
}
