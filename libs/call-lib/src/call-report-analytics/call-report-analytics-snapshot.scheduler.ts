import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CallReportAnalyticsService } from './call-report-analytics.service';
import {
    CALL_REPORT_ANALYTICS_KINDS,
    CallReportAnalyticsQueryDto,
} from './dto/call-report-analytics-query.dto';

/** Окно снапшота: прошедшая неделя. */
const SNAPSHOT_WINDOW_DAYS = 7;

/**
 * Weekly-снапшоты профилей порталов: раз в неделю строит ВСЕ отчёты
 * (summary/speech/objections/managers) по каждому домену из allowlist
 * CALL_REPORT_DOMAINS за прошедшие 7 дней и сохраняет в историю
 * (ais type=report-<вид>). Накопленные снапшоты — временной ряд для
 * трендов «куда движемся»: спады/подъёмы, гипотезы, прогнозы
 * (раздел 5.6 плана оптимизации).
 *
 * Включение: CALL_REPORT_ANALYTICS_SNAPSHOT_ENABLED=1 (по умолчанию
 * ВЫКЛЮЧЕН — включается сознательно, как и cron конвейера). Кэш при
 * построении не используется (useCache=false) — снапшот всегда свежий.
 *
 * Ошибка одного домена/отчёта не прерывает остальные — всё логируется.
 */
@Injectable()
export class CallReportAnalyticsSnapshotScheduler {
    private readonly logger = new Logger(
        CallReportAnalyticsSnapshotScheduler.name,
    );

    constructor(
        private readonly analytics: CallReportAnalyticsService,
        private readonly configService: ConfigService,
    ) {}

    /** Понедельник 03:15 — после ночного прогона агента за воскресенье. */
    @Cron('15 3 * * 1')
    async tick(): Promise<void> {
        if (
            this.configService.get<string>(
                'CALL_REPORT_ANALYTICS_SNAPSHOT_ENABLED',
            ) !== '1'
        ) {
            return;
        }
        const domains = (
            this.configService.get<string>('CALL_REPORT_DOMAINS') ?? ''
        )
            .split(',')
            .map(domain => domain.trim())
            .filter(Boolean);
        if (!domains.length) {
            this.logger.warn(
                'Снапшоты профилей: CALL_REPORT_DOMAINS пуст — нечего снимать',
            );
            return;
        }
        this.logger.log(
            `Weekly-снапшоты профилей: ${domains.length} домен(ов), окно ${SNAPSHOT_WINDOW_DAYS} дн.`,
        );
        for (const domain of domains) {
            await this.snapshotDomain(domain);
        }
    }

    /** Снапшот всех видов отчётов одного домена (ошибки не прерывают цикл). */
    async snapshotDomain(domain: string): Promise<void> {
        const to = new Date();
        const from = new Date(
            to.getTime() - SNAPSHOT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        );
        const query: CallReportAnalyticsQueryDto = {
            domain,
            from: from.toISOString(),
            to: to.toISOString(),
            useCache: false,
            saveToHistory: true,
        };
        for (const kind of CALL_REPORT_ANALYTICS_KINDS) {
            try {
                const report = await this.analytics.buildReport(kind, query);
                this.logger.log(
                    `Снапшот ${kind} (${domain}): звонков ${report.meta.filteredCalls}, ` +
                        `история ais ${report.meta.historyId ?? '—'}`,
                );
            } catch (error) {
                this.logger.error(
                    `Снапшот ${kind} (${domain}) не построен: ${(error as Error).message}`,
                    { telegram: true, domain, kind },
                );
            }
        }
    }
}
