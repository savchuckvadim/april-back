import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    CallAnalysisRepairUseCase,
    type CallAnalysisRepairResult,
} from '../use-cases/call-analysis-repair.use-case';
import { CallReportDomainRosterService } from './call-report-domain-roster.service';

const LOCK_KEY = 'call-report:analysis-repair-lock';
const LOCK_TTL_SEC = 55 * 60;

/**
 * Раз в час на 41-й минуте: не совпадает с получасовыми кронами event-sales
 * (:03/:07/:13/:17/:23 и +30), часовыми (:00) и разбором AI-аналитики (:10).
 */
export const CALL_ANALYSIS_REPAIR_CRON = '0 41 * * * *';
export const CALL_ANALYSIS_REPAIR_CRON_NAME = 'call-analysis-repair';

/** Строка итога по порталу для Telegram; пусто — сообщать нечего. */
export function repairSummaryLine(result: CallAnalysisRepairResult): string {
    const parts: string[] = [];
    if (result.repaired) parts.push(`дособрано разборов ${result.repaired}`);
    if (result.requeued)
        parts.push(`звонков поставлено заново ${result.requeued}`);
    if (result.stillPartial)
        parts.push(`опять неполных ${result.stillPartial}`);
    if (result.gaveUp) {
        parts.push(
            `брошено после трёх попыток ${result.gaveUp} — смотреть руками`,
        );
    }
    if (result.expired) {
        parts.push(
            `не разобрано за 72 часа и брошено ${result.expired} — смотреть руками`,
        );
    }
    return parts.length ? `${result.domain}: ${parts.join(', ')}` : '';
}

/**
 * Ежечасный догон разборов: что не собралось из-за сбоя поставщика модели,
 * переделывается, когда поставщик снова отвечает (CallAnalysisRepairUseCase).
 * Порталы — те же, что у сканера звонков; итог с изменениями — в Telegram.
 */
@Injectable()
export class CallAnalysisRepairScheduler {
    private readonly logger = new Logger(CallAnalysisRepairScheduler.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly roster: CallReportDomainRosterService,
        private readonly repair: CallAnalysisRepairUseCase,
    ) {}

    @Cron(CALL_ANALYSIS_REPAIR_CRON, { name: CALL_ANALYSIS_REPAIR_CRON_NAME })
    async tick(): Promise<void> {
        const domains = await this.roster.resolve();
        if (!domains.length) return;
        const redis = this.redisService.getClient();
        const locked = await redis.set(
            LOCK_KEY,
            String(process.pid),
            'EX',
            LOCK_TTL_SEC,
            'NX',
        );
        if (!locked) {
            this.logger.warn('Предыдущий догон разборов ещё идёт — пропуск');
            return;
        }
        const lines: string[] = [];
        try {
            for (const entry of domains) {
                try {
                    const result = await this.repair.repairDomain(entry.domain);
                    if (result.skipped) {
                        this.logger.log(
                            `Догон разборов ${entry.domain}: пропуск — ${result.skipped}`,
                        );
                        continue;
                    }
                    const line = repairSummaryLine(result);
                    if (line) lines.push(line);
                } catch (error) {
                    this.logger.error(
                        `Догон разборов ${entry.domain} упал: ${(error as Error).message}`,
                        { telegram: true, domain: entry.domain },
                    );
                }
            }
        } finally {
            await redis.del(LOCK_KEY).catch(() => undefined);
        }
        if (lines.length) {
            this.logger.warn(`Догон разборов:\n${lines.join('\n')}`, {
                telegram: true,
            });
        }
    }
}
