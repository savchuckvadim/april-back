import { Injectable } from '@nestjs/common';
import { buildAgenda, shiftDate, toPortalDate } from '@lib/sales-ai-analytics';
import { AiAgendaDto } from '../../dto/ai-agenda.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { CallsLoader } from '../loaders/calls.loader';
import { toAgendaRow } from '../loaders/lite-row.mapper';
import {
    dayStartUtc,
    isoWeekKey,
    portalRangeUtc,
    weekMondayOf,
} from '../loaders/period.util';
import { SettingsLoader } from '../loaders/settings.loader';
import { SmartLinkLoader } from '../loaders/smart-link.loader';

export interface AgendaUseCaseOptions {
    now?: Date;
}

/** Окна повестки в TZ портала: UTC-границы выборок и ключ недели. */
export interface AgendaWindows {
    /** Ключ ТЕКУЩЕЙ ISO-недели — неделя планёрки (ключ кэша и agenda_sent). */
    weekKey: string;
    /** Звонки: прошлая полная ISO-неделя, пн 00:00 — вс 23:59:59.999. */
    calls: { from: Date; to: Date };
    /** Несогласия: с понедельника прошлой недели до момента запроса. */
    disagreements: { from: Date; to: Date };
}

/**
 * Окна повестки на момент `now`: планёрка текущей недели разбирает звонки
 * прошлой полной ISO-недели (пн–вс перед понедельником текущей), а
 * несогласия собираются с понедельника прошлой недели по «сейчас» — чтобы
 * возражения, оставленные уже после рассылки, тоже попадали в повестку.
 */
export function agendaWindows(now: Date, timeZone: string): AgendaWindows {
    const today = toPortalDate(now, timeZone);
    const monday = weekMondayOf(today);
    const previousMonday = shiftDate(monday, -7);
    return {
        weekKey: isoWeekKey(today),
        calls: portalRangeUtc(previousMonday, shiftDate(monday, -1), timeZone),
        disagreements: { from: dayStartUtc(previousMonday, timeZone), to: now },
    };
}

/**
 * Повестка планёрки РОПа (план, 6.2/6.3): 3 звонка прошлой полной
 * ISO-недели по приоритету риск → спорное возражение → слабый раздел
 * (buildAgenda, детерминированно), ссылка на карточку разбора в смарте и
 * несогласия (feedback kind = disagree) с понедельника прошлой недели по
 * момент запроса. Ключ — текущая неделя: понедельничная рассылка в 08:30
 * и витрина в течение недели показывают одну и ту же повестку.
 *
 * Результат — на весь домен (кэш не дольше 15 минут и не дольше, чем до
 * следующего понедельника; запись несогласия и отзыв с сайта сбрасывают
 * его, чтобы новые несогласия были видны сразу); периметр requester'а
 * применяется applyAgendaPerimeter (presenter) при отдаче.
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
        const windows = agendaWindows(now, calendar.timeZone);

        const [rows, feedback] = await Promise.all([
            this.calls.loadLite(domain, windows.calls.from, windows.calls.to),
            this.feedback.listInPeriod(
                domain,
                windows.disagreements.from,
                windows.disagreements.to,
            ),
        ]);
        const picked = buildAgenda(rows.map(toAgendaRow));
        const links = await this.smartLinks.resolveLinks(
            domain,
            picked.map(item => item.transcriptionId),
        );

        return {
            weekKey: windows.weekKey,
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
