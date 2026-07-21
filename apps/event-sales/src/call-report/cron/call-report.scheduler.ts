import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import { TranscriptionStoreService } from '@lib/call-lib';
import { CallReportScanUseCase } from '../use-cases/call-report-scan.use-case';

const LOCK_KEY = 'call-report:scan-lock';
const LOCK_TTL_SEC = 25 * 60;

/**
 * Планировщик автоконвейера AI-отчётности по звонкам.
 *
 * Каждые 30 минут: реанимация зависших processing (упавший воркер не
 * должен прятать звонок от дедупа навсегда) + скан доменов из env
 * CALL_REPORT_DOMAINS (allowlist пилотных порталов через запятую).
 *
 * Защита: kill-switch CALL_REPORT_CRON_ENABLED=1, Redis-лок от
 * наложения тиков, ошибка одного домена не роняет цикл
 * (паттерн pbx-list-field-monitoring).
 */
@Injectable()
export class CallReportScheduler {
    private readonly logger = new Logger(CallReportScheduler.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly scanUseCase: CallReportScanUseCase,
    ) {}

    @Cron(CronExpression.EVERY_30_MINUTES)
    async tick(): Promise<void> {
        if (
            this.configService.get<string>('CALL_REPORT_CRON_ENABLED') !== '1'
        ) {
            return;
        }

        const domains = this.getDomains();
        if (!domains.length) {
            this.logger.warn(
                'CALL_REPORT_CRON_ENABLED=1, но CALL_REPORT_DOMAINS пуст — скан пропущен',
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
            for (const domain of domains) {
                try {
                    await this.scanUseCase.execute(domain);
                } catch (error) {
                    this.logger.error(
                        `Скан домена ${domain} упал: ${(error as Error).message}`,
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
    }

    /** Зависшие processing старше порога → error (звонок снова виден дедупу). */
    private async reanimateStale(): Promise<void> {
        const staleMinutes = Number(
            this.configService.get<string>('CALL_REPORT_STALE_MINUTES') ?? 90,
        );
        const olderThan = new Date(Date.now() - staleMinutes * 60_000);
        try {
            const count =
                await this.transcriptionStore.reanimateStaleProcessing(
                    olderThan,
                );
            if (count > 0) {
                this.logger.warn(
                    `Реанимировано зависших транскрибаций: ${count}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `Реанимация зависших не выполнена: ${(error as Error).message}`,
            );
        }
    }

    private getDomains(): string[] {
        const raw = this.configService.get<string>('CALL_REPORT_DOMAINS') ?? '';
        return raw
            .split(',')
            .map(domain => domain.trim())
            .filter(Boolean);
    }
}
