import { Injectable } from '@nestjs/common';
import {
    buildRegistryContext,
    computePulse,
    lastWorkdays,
    minDurationByType,
    previousWorkday,
    resolveNumberParam,
    toPortalDate,
    type MinDurationSecByType,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_WINDOWS } from '../../constants/ai-analytics.const';
import { AiPulseDto } from '../../dto/ai-pulse.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { CallsLoader } from '../loaders/calls.loader';
import { toPulseRow } from '../loaders/lite-row.mapper';
import { portalRangeUtc } from '../loaders/period.util';
import {
    AiAnalyticsPortalSettings,
    SettingsLoader,
} from '../loaders/settings.loader';
import { AlertMarks, collectPulseAlerts } from '../presenter/pulse-alerts.util';
import { toPulseDto } from '../presenter/pulse.presenter';

export interface PulseUseCaseOptions {
    /** «Сейчас» (для тестов и крона); по умолчанию — текущее время. */
    now?: Date;
}

/**
 * Пороги «разбираемого» звонка портала (решение владельца А.1, P2-56):
 * карта определений `ai_analytics_definitions.minDurationSecByType` —
 * ровно та, которую читает ночной конвейер, — и значение реестра
 * `min_duration_sec_by_type`, разрешённое с контекстом портала
 * (`buildRegistryContext` собирает те же слои, что AiAnalyticsParamsLoader
 * отдаёт шагам конвейера в `ctx.registry`).
 *
 * Портал ничего не решал — дефолт реестра 300 с, то есть поведение
 * Фазы 1a бит-в-бит. Один вход для пульса и конвейера: разъехавшийся
 * порог развёл бы знаменатель пульса и набор разбираемых звонков.
 */
export function portalMinDurationByType(
    settings: AiAnalyticsPortalSettings,
): MinDurationSecByType {
    const ctx = buildRegistryContext({
        modelParams: settings.modelParams,
        definitions: settings.definitions,
    });

    return minDurationByType(
        settings.definitions.minDurationSecByType,
        resolveNumberParam('min_duration_sec_by_type', ctx),
    );
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
        const settings = await this.settings.load(domain);
        const { calendar } = settings;
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
            minDurationSecByType: portalMinDurationByType(settings),
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
