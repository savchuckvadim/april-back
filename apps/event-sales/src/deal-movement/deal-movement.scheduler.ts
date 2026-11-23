import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CallSource } from '@lib/core/call-context';
import { DEAL_MOVEMENT_REQUESTERS } from '@lib/sales-ai-analytics';
import { resolveTimezoneByDomain } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import {
    DEAL_MOVEMENT_CRON,
    DEAL_MOVEMENT_CRON_NAME,
} from './constants/deal-movement.const';
import { isDealMovementDue } from './lib/deal-movement-schedule';
import { DealMovementRunService } from './services/deal-movement-run.service';
import { DealMovementRunState } from './services/deal-movement-run-state';
import { DealMovementSettingsService } from './services/deal-movement-settings.service';

/**
 * Планировщик движения сделок: тик каждый час в :27, порталы с
 * «Движение сделок: включено». Портал считается раз в сутки, когда у него
 * ночь (02:00–05:00 по своему поясу) и сегодня счёта ещё не было; сорвался
 * — следующий тик окна попробует снова (метка ставится только после
 * сохранения).
 *
 * Паттерн общий с аудитом сделок: замок тика в Redis, порталы по очереди,
 * ошибка портала не роняет цикл (её итог уже ушёл в Telegram).
 */
@Injectable()
export class DealMovementScheduler {
    private readonly logger = new Logger(DealMovementScheduler.name);

    constructor(
        private readonly settings: DealMovementSettingsService,
        private readonly runState: DealMovementRunState,
        private readonly runs: DealMovementRunService,
    ) {}

    @Cron(DEAL_MOVEMENT_CRON, { name: DEAL_MOVEMENT_CRON_NAME })
    @CallSource(`cron:${DEAL_MOVEMENT_CRON_NAME}`, 'Крон: движение сделок')
    async tick(now: Date = new Date()): Promise<void> {
        const domains = await this.enabledDomains();
        if (domains.length === 0) return;
        const token = await this.runState.lockTick();
        if (token === null) {
            this.logger.warn('Прошлый тик движения сделок ещё идёт — пропуск');
            return;
        }
        try {
            for (const domain of domains) {
                const lastRun = await this.runState.lastRun(domain);
                const due = isDealMovementDue({
                    now,
                    tz: resolveTimezoneByDomain(domain),
                    lastDay: lastRun?.day ?? null,
                });
                if (!due) continue;
                const outcome = await this.runs.run(
                    domain,
                    'count',
                    DEAL_MOVEMENT_REQUESTERS.nightly,
                    now,
                );
                if (outcome.kind === 'busy') {
                    this.logger.log(
                        `Движение сделок ${domain}: идёт ручной прогон — ночной счёт в следующий тик`,
                    );
                }
            }
        } finally {
            await this.runState.unlockTick(token);
        }
    }

    /** Порталы с включённым счётом; сбой чтения — пустой список и тревога. */
    private async enabledDomains(): Promise<string[]> {
        try {
            return await this.settings.enabledDomains();
        } catch (error) {
            this.logger.error(
                `Движение сделок: порталы не прочитаны — тик пропущен: ${getErrorString(error)}`,
                { telegram: true },
            );
            return [];
        }
    }
}
