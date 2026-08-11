import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    buildSkapLastScanKey,
    SKAP_SCAN_LOCK_KEY,
    SkapFileRepository,
    SkapRunRepository,
} from '@lib/skap-lib';

/** TTL лока тика: сам тик лёгкий (ростер + dispatch), работа — в Bull. */
const LOCK_TTL_SEC = 10 * 60;
/** Реанимация зависших: processing/running старше этого — авария воркера. */
const STALE_MINUTES = 240;

/**
 * Планировщик импорта СКАП: тик каждые 30 минут, конфигурация — в БД
 * per-портал (PORTAL_APP_SETTINGS_SCHEMA, app=skap; включение и интервал
 * меняются из админки без деплоя). Kill-switch не нужен: нет включённых
 * порталов → тик no-op.
 *
 * Тик только диспатчит run-джобы (весь compute — в воркере очереди);
 * интервал per-портал (`scanIntervalMinutes`) фильтрует домены через
 * Redis-метку последнего скана: на обкатке часто, потом хоть раз в неделю.
 */
@Injectable()
export class SkapImportScheduler implements OnModuleInit {
    private readonly logger = new Logger(SkapImportScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly settingsService: PortalAppSettingsService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly fileRepo: SkapFileRepository,
        private readonly runRepo: SkapRunRepository,
    ) {}

    onModuleInit(): void {
        // Дешёвая диагностика на проде: откуда берётся конфигурация.
        this.logger.log(
            'Импорт СКАП: ростер порталов — portal_app_settings (app=skap), ' +
                'тик каждые 30 минут, интервал per-портал',
        );
    }

    @Cron(CronExpression.EVERY_30_MINUTES, {
        name: 'skap-import-scan',
        timeZone: 'Europe/Moscow',
    })
    async tick(): Promise<void> {
        const redis = this.redisService.getClient();
        const locked = await redis.set(
            SKAP_SCAN_LOCK_KEY,
            String(process.pid),
            'EX',
            LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) {
            this.logger.warn('Предыдущий тик СКАП ещё выполняется — пропуск');
            return;
        }
        try {
            // Реанимация зависших (воркер умер: processing/running навсегда).
            const staleFiles =
                await this.fileRepo.reanimateStale(STALE_MINUTES);
            const staleRuns = await this.runRepo.reanimateStale(STALE_MINUTES);
            if (staleFiles || staleRuns) {
                this.logger.warn(
                    `Реанимация СКАП: файлов ${staleFiles}, прогонов ${staleRuns}`,
                    { telegram: true },
                );
            }

            const records = await this.settingsService.listByAppCode(
                EnumPortalAppCode.skap,
            );
            for (const record of records) {
                try {
                    await this.scanDomain(record.domain);
                } catch (error) {
                    this.logger.error(
                        `Тик СКАП по домену ${record.domain} упал: ${(error as Error).message}`,
                        { telegram: true, domain: record.domain },
                    );
                }
            }
        } finally {
            await redis.del(SKAP_SCAN_LOCK_KEY).catch(() => undefined);
        }
    }

    private async scanDomain(domain: string): Promise<void> {
        const settings = await this.settingsService.resolve(
            domain,
            EnumPortalAppCode.skap,
        );
        if (!settings.enabled) return;
        if (!(await this.isDue(domain, settings.scanIntervalMinutes))) return;

        await this.queueDispatcher.dispatch(
            QueueNames.SKAP_IMPORT,
            JobNames.SKAP_IMPORT_RUN,
            { domain },
            // jobId: второй run на домен не встанет, пока первый в очереди
            `${domain}:run`,
            {
                attempts: 1,
                timeout: (settings.maxRunMinutes + 10) * 60_000,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
        await this.markScanned(domain);
        this.logger.log(`СКАП: run-джоб поставлен для ${domain}`);
    }

    /** Интервал per-портал через Redis-метку последнего скана. */
    private async isDue(
        domain: string,
        intervalMinutes: number,
    ): Promise<boolean> {
        const raw = await this.redisService
            .getClient()
            .get(buildSkapLastScanKey(domain))
            .catch(() => null);
        if (!raw) return true;
        const lastScanAt = Number(raw);
        if (!Number.isFinite(lastScanAt)) return true;
        return Date.now() - lastScanAt >= intervalMinutes * 60_000;
    }

    private async markScanned(domain: string): Promise<void> {
        await this.redisService
            .getClient()
            .set(buildSkapLastScanKey(domain), String(Date.now()))
            .catch(() => undefined);
    }
}
