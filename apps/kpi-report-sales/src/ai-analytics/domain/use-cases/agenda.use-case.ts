import { Injectable } from '@nestjs/common';
import { buildAgenda, toPortalDate } from '@lib/sales-ai-analytics';
import { AiAgendaDto } from '../../dto/ai-agenda.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { CallsLoader } from '../loaders/calls.loader';
import { toAgendaRow } from '../loaders/lite-row.mapper';
import {
    isoWeekKey,
    portalRangeUtc,
    weekMondayOf,
} from '../loaders/period.util';
import { SettingsLoader } from '../loaders/settings.loader';
import { SmartLinkLoader } from '../loaders/smart-link.loader';

export interface AgendaUseCaseOptions {
    now?: Date;
}

/**
 * Повестка РОПа на неделю (план, 6.2/6.3): 3 звонка текущей ISO-недели
 * (пн — сегодня в TZ портала) по приоритету риск → спорное возражение →
 * слабый раздел (buildAgenda, детерминированно), ссылка на карточку
 * разбора в смарте, несогласия недели (feedback kind = disagree).
 *
 * Результат — на весь домен (кэш до следующего понедельника); периметр
 * requester'а применяется applyAgendaPerimeter (presenter) при отдаче.
 */
@Injectable()
export class AgendaUseCase {
    constructor(
        private readonly calls: CallsLoader,
        private readonly settings: SettingsLoader,
        private readonly feedback: AiAnalyticsFeedbackStore,
        private readonly smartLinks: SmartLinkLoader,
    ) {}

    /** Ключ текущей ISO-недели в TZ портала и TZ (для ключа кэша и TTL). */
    async resolveWeek(
        domain: string,
        now = new Date(),
    ): Promise<{ weekKey: string; timeZone: string }> {
        const { calendar } = await this.settings.load(domain);
        return {
            weekKey: isoWeekKey(toPortalDate(now, calendar.timeZone)),
            timeZone: calendar.timeZone,
        };
    }

    async execute(
        domain: string,
        options: AgendaUseCaseOptions = {},
    ): Promise<AiAgendaDto> {
        const now = options.now ?? new Date();
        const { calendar } = await this.settings.load(domain);
        const today = toPortalDate(now, calendar.timeZone);
        const monday = weekMondayOf(today);
        const { from, to } = portalRangeUtc(monday, today, calendar.timeZone);

        const [rows, feedback] = await Promise.all([
            this.calls.loadLite(domain, from, to),
            this.feedback.listInPeriod(domain, from, to),
        ]);
        const picked = buildAgenda(rows.map(toAgendaRow));
        const links = await this.smartLinks.resolveLinks(
            domain,
            picked.map(item => item.transcriptionId),
        );

        return {
            weekKey: isoWeekKey(today),
            items: picked.map(item => ({
                ...item,
                link: links.get(item.transcriptionId) ?? null,
            })),
            disagreements: feedback
                .filter(record => record.kind === 'disagree')
                .map(record => ({
                    managerId: record.managerId,
                    object: record.object,
                    reason: record.reason,
                })),
        };
    }
}
