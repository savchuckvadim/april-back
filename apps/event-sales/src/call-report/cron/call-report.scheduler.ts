import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { TranscriptionStoreService } from '@lib/call-lib';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
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
 * Каждые 30 минут: реанимация зависших processing + обход ВКЛЮЧЁННЫХ
 * порталов из portal_ai_settings (включение — из админки: карточка
 * портала → вкладка AI). Параметры каждого домена — из настроек портала
 * с дефолтами кода (CallReportSettingsService); env-конфигурации нет.
 * Портал пропускается, пока с lastScanAt не прошёл его интервал.
 *
 * Kill-switch отдельного нет: нет включённых порталов — тик no-op.
 * Защита: Redis-лок от наложения тиков, ошибка одного домена не роняет
 * цикл (паттерн pbx-list-field-monitoring).
 */
@Injectable()
export class CallReportScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallReportScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly scanUseCase: CallReportScanUseCase,
        private readonly roster: CallReportDomainRosterService,
        private readonly settingsService: CallReportSettingsService,
        private readonly portalAiSettings: PortalAiSettingsService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    /** Диагностика на старте: откуда берётся конфигурация. */
    onModuleInit(): void {
        this.logger.log(
            'Автоконвейер call-report: конфигурация — ТОЛЬКО portal_ai_settings ' +
                '(админка → карточка портала → вкладка AI); env-настроек нет. ' +
                'Включённые порталы читаются на каждом тике (раз в 30 минут).',
        );
    }

    @Cron(CronExpression.EVERY_30_MINUTES)
    async tick(): Promise<void> {
        const domains = await this.roster.resolve();

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
            await this.releaseDeadClaims();
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
        if (!settings.enabled) {
            // Ростер отдаёт включённые, но между выборкой и сканом админ
            // мог выключить портал — перечитанные настройки главнее.
            return;
        }
        if (!this.isDueByInterval(settings, new Date())) {
            return;
        }

        await this.scanUseCase.execute(entry.domain, {
            minDurationSec: settings.minDurationSec,
            windowHours: settings.windowHours,
            maxPerRun: settings.maxPerRun,
            allowedUserIds: settings.allowedUserIds ?? undefined,
            createSmartItem: settings.createSmartEnabled,
            salesOnly: settings.salesOnly,
        });

        await this.portalAiSettings
            .markScanned(entry.portalId)
            .catch((error: Error) =>
                this.logger.warn(
                    `lastScanAt портала ${entry.portalId} не записан: ${error.message}`,
                ),
            );
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

    /**
     * Мёртвые брони: строка 'queued' старше порога, а джоба в очереди уже
     * НЕТ (потерян при сбросе Redis, съеден stalled-лимитом). Проверка
     * живости обязательна: слепой перевод по таймеру вернул бы исходный
     * баг — скан поставил бы дубль, Bull молча его проглотил, а слот
     * прохода сгорел бы впустую.
     */
    private async releaseDeadClaims(): Promise<void> {
        const staleMinutes = this.settingsService.globals().staleMinutes;
        const olderThan = new Date(Date.now() - staleMinutes * 60_000);
        try {
            const stale =
                await this.transcriptionStore.findStaleQueued(olderThan);
            if (!stale.length) return;

            const dead: string[] = [];
            for (const item of stale) {
                const job = await this.queueDispatcher.getJob(
                    QueueNames.CALL_REPORT,
                    item.dedupKey,
                );
                if (!job) dead.push(item.id);
            }
            if (!dead.length) {
                this.logger.log(
                    `Броней старше порога: ${stale.length}, все с живыми задачами — ждём`,
                );
                return;
            }
            const count = await this.transcriptionStore.markPipelineError(dead);
            this.logger.warn(
                `Снято мёртвых броней: ${count} из ${stale.length} (задача потеряна) — ` +
                    `звонки снова видны сканеру`,
                { telegram: true, count },
            );
        } catch (error) {
            this.logger.error(
                `Снятие мёртвых броней не выполнено: ${(error as Error).message}`,
                { telegram: true },
            );
        }
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
