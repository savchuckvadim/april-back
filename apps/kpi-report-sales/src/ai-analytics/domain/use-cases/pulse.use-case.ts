import { Injectable } from '@nestjs/common';
import {
    computePulse,
    lastWorkdays,
    previousWorkday,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_WINDOWS } from '../../constants/ai-analytics.const';
import { AiPulseDto } from '../../dto/ai-pulse.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { CallsLoader } from '../loaders/calls.loader';
import { toPulseRow } from '../loaders/lite-row.mapper';
import { portalRangeUtc } from '../loaders/period.util';
import { SettingsLoader } from '../loaders/settings.loader';
import { AlertMarks, collectPulseAlerts } from '../presenter/pulse-alerts.util';
import { toPulseDto } from '../presenter/pulse.presenter';

export interface PulseUseCaseOptions {
    /** «Сейчас» (для тестов и крона); по умолчанию — текущее время. */
    now?: Date;
}

/**
 * Пульс дисциплины «следующий шаг с датой» (план, 6.2/6.3): окно из 5
 * рабочих дней до вчерашнего рабочего дня в TZ портала, история 25
 * рабочих дней для XmR, сигналы руководителю по звонкам окна.
 *
 * Результат — на весь домен (кэшируется контроллером); периметр
 * requester'а применяется presenter'ом при отдаче.
 */
@Injectable()
export class PulseUseCase {
    constructor(
        private readonly calls: CallsLoader,
        private readonly settings: SettingsLoader,
        private readonly feedback: AiAnalyticsFeedbackStore,
    ) {}

    /** Последний день окна: вчерашний рабочий день в TZ портала. */
    async resolveEndDate(domain: string, now = new Date()): Promise<string> {
        const { calendar } = await this.settings.load(domain);
        return previousWorkday(toPortalDate(now, calendar.timeZone), calendar);
    }

    async execute(
        domain: string,
        options: PulseUseCaseOptions = {},
    ): Promise<AiPulseDto> {
        const now = options.now ?? new Date();
        const { calendar } = await this.settings.load(domain);
        const endDate = previousWorkday(
            toPortalDate(now, calendar.timeZone),
            calendar,
        );
        const history = lastWorkdays(
            endDate,
            AI_ANALYTICS_WINDOWS.pulseHistoryWorkdays,
            calendar,
        );
        const { from, to } = portalRangeUtc(
            history[0] ?? endDate,
            endDate,
            calendar.timeZone,
        );

        const [rows, marks] = await Promise.all([
            this.calls.loadLite(domain, from, to),
            this.loadAlertMarks(domain, from, to),
        ]);
        const result = computePulse(rows.map(toPulseRow), {
            endDate,
            calendar,
            historyWorkdays: AI_ANALYTICS_WINDOWS.pulseHistoryWorkdays,
        });
        const alerts = collectPulseAlerts(
            rows,
            result.window,
            calendar.timeZone,
            marks,
        );
        return toPulseDto(endDate, result, alerts);
    }

    /** Отправленные/отработанные алерты по звонкам (ais feedback). */
    private async loadAlertMarks(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<AlertMarks> {
        const records = await this.feedback.listInPeriod(domain, from, to);
        const sent = new Set<string>();
        const handled = new Set<string>();
        for (const record of records) {
            if (!record.transcriptionId) continue;
            if (record.kind === 'alert_sent') sent.add(record.transcriptionId);
            if (record.kind === 'alert_handled') {
                handled.add(record.transcriptionId);
            }
        }
        return { sent, handled };
    }
}
