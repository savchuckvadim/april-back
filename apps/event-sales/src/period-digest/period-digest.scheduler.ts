import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CallSource } from '@lib/core/call-context';
import { RopReportTicker } from '@lib/rop-reports';
import {
    PERIOD_DIGEST_CRON,
    PERIOD_DIGEST_CRON_NAME,
} from './constants/period-digest.const';
import { PeriodDigestDefinition } from './period-digest.definition';

/**
 * Планировщик итогов периода: тонкий `@Cron` над общим движком отчётов
 * РОПу. Тик каждый час: порталы с «Итоги периода по менеджерам: включено»
 * → политики выпуска видов периода (неделя — день и час настройки,
 * месяц — первый рабочий день) → невыпущенный период → расчёт карточек.
 * Замок тика и портала, метки выпуска, повторы и итог в Telegram — в
 * движке (`RopReportTicker.tick`).
 *
 * Пока доставки нет (Э7), плановый прогон — только подсчёт.
 */
@Injectable()
export class PeriodDigestScheduler {
    constructor(
        private readonly ticker: RopReportTicker,
        private readonly definition: PeriodDigestDefinition,
    ) {}

    @Cron(PERIOD_DIGEST_CRON, { name: PERIOD_DIGEST_CRON_NAME })
    @CallSource(`cron:${PERIOD_DIGEST_CRON_NAME}`, 'Крон: итоги периода')
    async tick(now: Date = new Date()): Promise<void> {
        await this.ticker.tick(this.definition, now);
    }
}
