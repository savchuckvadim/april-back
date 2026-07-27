import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
export class CallReportScheduler implements OnModuleInit {
    private readonly logger = new Logger(CallReportScheduler.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly scanUseCase: CallReportScanUseCase,
    ) {}

    /**
     * Диагностика на старте: какие значения cron РЕАЛЬНО видит из env.
     * Прод-инцидент 2026-07-27: флаг «включали», но контейнеру приезжал
     * другой env (второй env_file перекрывает первый; env_file применяется
     * только при recreate) — тик выходил молча, причину было не разглядеть.
     */
    onModuleInit(): void {
        const enabled =
            this.configService.get<string>('CALL_REPORT_CRON_ENABLED') === '1';
        const domains = this.getDomains();
        const domainsLabel = domains
            .map(entry =>
                entry.demoUserIds
                    ? `${entry.domain} (ДЕМО: ${entry.demoUserIds.join('|')})`
                    : entry.domain,
            )
            .join(', ');
        this.logger.log(
            `Автоконвейер call-report: cron ${enabled ? 'ВКЛЮЧЁН' : 'ВЫКЛЮЧЕН (CALL_REPORT_CRON_ENABLED!=1)'}` +
                `, домены: ${domainsLabel || '(пусто)'}`,
        );
        if (enabled && !domains.length) {
            this.logger.warn(
                'CALL_REPORT_CRON_ENABLED=1, но CALL_REPORT_DOMAINS пуст — тики будут пропускаться',
            );
        }
    }

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
            for (const entry of domains) {
                try {
                    await this.scanUseCase.execute(entry.domain, {
                        allowedUserIds: entry.demoUserIds,
                    });
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

    /**
     * Парсит CALL_REPORT_DOMAINS. Формат записи (через запятую):
     * `domain` — полный режим (весь отдел продаж);
     * `domain:222|323` — ДЕМО: анализировать только этих сотрудников
     * (bitrix-id, через |), поверх фильтра ОП.
     */
    private getDomains(): { domain: string; demoUserIds?: number[] }[] {
        const raw = this.configService.get<string>('CALL_REPORT_DOMAINS') ?? '';
        return raw
            .split(',')
            .map(entry => entry.trim())
            .filter(Boolean)
            .map(entry => {
                const [domain, users] = entry.split(':');
                const demoUserIds = users
                    ?.split('|')
                    .map(id => Number(id.trim()))
                    .filter(id => Number.isFinite(id) && id > 0);
                return {
                    domain: domain.trim(),
                    demoUserIds: demoUserIds?.length ? demoUserIds : undefined,
                };
            })
            .filter(entry => Boolean(entry.domain));
    }
}
