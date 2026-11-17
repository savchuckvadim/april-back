import { Injectable } from '@nestjs/common';
import type {
    RopReportDefinition,
    RopRunContext,
    RopRunResult,
} from '@lib/rop-reports';
import { PeriodDigestCalendarAdapter } from './adapters/period-digest-calendar.adapter';
import {
    PERIOD_DIGEST_CODE,
    PERIOD_DIGEST_KEYS,
    PERIOD_DIGEST_MAX_ATTEMPTS,
    PERIOD_DIGEST_TITLE,
} from './constants/period-digest.const';
import { periodDigestSummaryLines } from './lib/period-digest-summary';
import { PeriodDigestCardsService } from './services/period-digest-cards.service';
import { PeriodDigestSettingsService } from './services/period-digest-settings.service';
import type { PeriodDigestOptions } from './types/period-digest.types';

/**
 * Итоги периода по менеджерам для движка отчётов РОПу (`@lib/rop-reports`):
 * свои — настройки, календарь портала и прогон периода (расчёт карточек и
 * снимки в ais), общее — тик, замки, метки выпуска, повторы и итог в
 * Telegram — делает движок.
 *
 * Пока доставки нет (Э7), прогон — только подсчёт: задач и получателей
 * нет, итог «только считать».
 *
 * `@Injectable` без Битрикса в полях.
 */
@Injectable()
export class PeriodDigestDefinition
    implements RopReportDefinition<PeriodDigestOptions>
{
    readonly code = PERIOD_DIGEST_CODE;
    readonly title = PERIOD_DIGEST_TITLE;
    readonly keys = PERIOD_DIGEST_KEYS;
    readonly maxAttempts = PERIOD_DIGEST_MAX_ATTEMPTS;

    constructor(
        private readonly settings: PeriodDigestSettingsService,
        readonly calendar: PeriodDigestCalendarAdapter,
        private readonly cards: PeriodDigestCardsService,
    ) {}

    enabledDomains(): Promise<string[]> {
        return this.settings.enabledDomains();
    }

    resolveOptions(
        domain: string,
        overrides: { readonly countOnly?: boolean },
    ): Promise<PeriodDigestOptions> {
        return this.settings.resolveOptions(domain, overrides);
    }

    async run(
        context: RopRunContext<PeriodDigestOptions>,
        warnings: string[],
    ): Promise<RopRunResult> {
        const { domain, period } = context;
        const { timezone } = await this.calendar.resolve(domain);
        const report = await this.cards.run(
            {
                domain,
                period,
                timezone,
                options: context.options,
                now: context.now,
                heartbeat: () => context.heartbeat(),
            },
            warnings,
        );
        return {
            domain,
            kind: period.kind,
            periodKey: period.key,
            countOnly: true,
            recipients: 0,
            tasksCreated: 0,
            tasksAlreadyDone: 0,
            tasksClosed: 0,
            summary: periodDigestSummaryLines(report),
            warnings,
        };
    }
}
