import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { TranscriptionStoreService } from '@lib/call-lib';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import {
    CallReportSettingsService,
    EffectiveCallReportSettings,
} from '../services/call-report-settings.service';
import { CallReportScanUseCase } from '../use-cases/call-report-scan.use-case';
import {
    CallReportDomainEntry,
    CallReportDomainRosterService,
} from './call-report-domain-roster.service';

const LOCK_KEY = 'call-report:scan-lock';
const LOCK_TTL_SEC = 25 * 60;

/**
 * Планировщик автоконвейера AI-отчётности по звонкам.
 *
 * Каждые 30 минут: реанимация зависших processing + обход доменов из
 * ростера (env CALL_REPORT_DOMAINS ∪ включённые порталы portal_ai_settings).
 * Параметры каждого домена — из склейки портал → env → дефолт
 * (CallReportSettingsService): пороги, демо-список, интервалы сканирования
 * (портал пропускается, пока с lastScanAt не прошёл его интервал).
 *
 * Защита: kill-switch CALL_REPORT_CRON_ENABLED=1, Redis-лок от
 * наложения тиков, ошибка одного домена не роняет цикл
 * (паттерн pbx-list-field-monitoring).
 */
@Injectable()
export class CallReportScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallReportScheduler.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly scanUseCase: CallReportScanUseCase,
        private readonly roster: CallReportDomainRosterService,
        private readonly settingsService: CallReportSettingsService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {}

    /**
     * Диагностика на старте: какие значения cron РЕАЛЬНО видит из env.
     * Прод-инцидент 2026-07-27: флаг «включали», но контейнеру приезжал
     * другой env (второй env_file перекрывает первый; env_file применяется
     * только при recreate) — тик выходил молча, причину было не разглядеть.
     * Порталы из БД сюда не попадают намеренно: они читаются на каждом
     * тике, а не при старте.
     */
    onModuleInit(): void {
        const enabled =
            this.configService.get<string>('CALL_REPORT_CRON_ENABLED') === '1';
        const domains = this.roster.fromEnv();
        const domainsLabel = domains
            .map(entry =>
                entry.demoUserIds
                    ? `${entry.domain} (ДЕМО: ${entry.demoUserIds.join('|')})`
                    : entry.domain,
            )
            .join(', ');
        this.logger.log(
            `Автоконвейер call-report: cron ${enabled ? 'ВКЛЮЧЁН' : 'ВЫКЛЮЧЕН (CALL_REPORT_CRON_ENABLED!=1)'}` +
                `, env-домены: ${domainsLabel || '(пусто)'} + включённые порталы из БД` +
                `, смарт-элементы по умолчанию: ${this.settingsService.globals().createSmartEnabled ? 'создаются' : 'ВЫКЛЮЧЕНЫ (CALL_REPORT_CRON_CREATE_SMART=0)'}`,
        );
    }

    @Cron(CronExpression.EVERY_30_MINUTES)
    async tick(): Promise<void> {
        if (
            this.configService.get<string>('CALL_REPORT_CRON_ENABLED') !== '1'
        ) {
            return;
        }

        const domains = await this.roster.resolve();
        if (!domains.length) {
            this.logger.warn(
                'CALL_REPORT_CRON_ENABLED=1, но домены не заданы ни в CALL_REPORT_DOMAINS, ни в настройках порталов — скан пропущен',
            );
            return;
        }

        const redis = this.redisService.getClient();
        const locked = await redis.set(
            LOCK_KEY,
            String(process.pid),
            'EX',
            LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) {
            this.logger.warn('Предыдущий тик ещё выполняется — пропуск');
            return;
        }

        try {
            await this.reanimateStale();
            for (const entry of domains) {
                try {
                    await this.scanDomain(entry);
                } catch (error) {
                    // { telegram: true } — форс-алерт админам (транспорт логгера)
                    this.logger.error(
                        `Скан домена ${entry.domain} упал: ${(error as Error).message}`,
                        { telegram: true, domain: entry.domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /** Скан одного домена с эффективными настройками его портала. */
    private async scanDomain(entry: CallReportDomainEntry): Promise<void> {
        const settings = await this.settingsService.resolve(entry.domain);
        if (settings.enabled === false) {
            this.logger.log(
                `Домен ${entry.domain} выключен в настройках портала — пропуск`,
            );
            return;
        }
        if (!this.isDueByInterval(settings, new Date())) {
            return;
        }

        await this.scanUseCase.execute(entry.domain, {
            minDurationSec: settings.minDurationSec,
            windowHours: settings.windowHours,
            maxPerRun: settings.maxPerRun,
            // ДЕМО-список портала главнее env-суффикса — та же склейка,
            // что и у остальных настроек (портал → env).
            allowedUserIds: settings.allowedUserIds ?? entry.demoUserIds,
            createSmartItem: settings.createSmartEnabled,
            salesOnly: settings.salesOnly,
        });

        if (entry.portalId != null) {
            await this.portalAiSettings
                .markScanned(entry.portalId)
                .catch((error: Error) =>
                    this.logger.warn(
                        `lastScanAt портала ${entry.portalId} не записан: ${error.message}`,
                    ),
                );
        }
    }

    /**
     * Пора ли сканировать портал: интервал не задан — на каждом тике;
     * задан — только когда с lastScanAt прошло не меньше интервала.
     * В ночном окне действует ночной интервал (звонков нет — тики реже).
     */
    private isDueByInterval(
        settings: EffectiveCallReportSettings,
        now: Date,
    ): boolean {
        const interval = this.currentIntervalMinutes(settings, now);
        if (interval == null || settings.lastScanAt == null) return true;
        return (
            now.getTime() - settings.lastScanAt.getTime() >= interval * 60_000
        );
    }

    /** Действующий интервал: ночной внутри ночного окна, иначе дневной. */
    private currentIntervalMinutes(
        settings: EffectiveCallReportSettings,
        now: Date,
    ): number | null {
        const { nightStartHour, nightEndHour, nightScanIntervalMinutes } =
            settings;
        if (
            nightStartHour != null &&
            nightEndHour != null &&
            nightScanIntervalMinutes != null
        ) {
            const hour = this.moscowHour(now);
            // Окно может пересекать полночь: 22-6 значит «с 22 до 6 утра».
            const isNight =
                nightStartHour <= nightEndHour
                    ? hour >= nightStartHour && hour < nightEndHour
                    : hour >= nightStartHour || hour < nightEndHour;
            if (isNight) return nightScanIntervalMinutes;
        }
        return settings.scanIntervalMinutes;
    }

    /** Час суток по Москве — все клиенты в РФ, таймзону портал не хранит. */
    private moscowHour(now: Date): number {
        return Number(
            new Intl.DateTimeFormat('ru-RU', {
                hour: 'numeric',
                hour12: false,
                timeZone: 'Europe/Moscow',
            }).format(now),
        );
    }

    /** Зависшие processing старше порога → error (звонок снова виден дедупу). */
    private async reanimateStale(): Promise<void> {
        const staleMinutes = this.settingsService.globals().staleMinutes;
        const olderThan = new Date(Date.now() - staleMinutes * 60_000);
        try {
            const count =
                await this.transcriptionStore.reanimateStaleProcessing(
                    olderThan,
                );
            if (count > 0) {
                this.logger.warn(
                    `Реанимировано зависших транскрибаций: ${count} (упавшие воркеры/таймауты)`,
                    { telegram: true, count },
                );
            }
        } catch (error) {
            this.logger.error(
                `Реанимация зависших не выполнена: ${(error as Error).message}`,
                { telegram: true },
            );
        }
    }
}
