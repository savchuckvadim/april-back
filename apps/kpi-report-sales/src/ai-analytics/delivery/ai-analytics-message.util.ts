/**
 * Чистые построители текстов push-уведомлений (BB-код Bitrix, как у
 * алерта event-sales и недельного отчёта): повестка планёрки РОПу и
 * утренний разбор менеджеру. Без Nest и Bitrix — покрываются тестами
 * напрямую.
 */
import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_SECTIONS,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    DigestItem,
    isIsoWeekKey,
    mondayOfIsoWeek,
    shiftDate,
} from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_PUSH_QUOTE_MAX_LENGTH } from '../constants/ai-analytics.const';
import { AiAgendaDisagreementDto, AiAgendaItemDto } from '../dto/ai-agenda.dto';
import { feedbackObjectLabel } from './feedback-object-label.util';

export interface AgendaMessageInput {
    weekKey: string;
    items: readonly AiAgendaItemDto[];
    disagreements: readonly AiAgendaDisagreementDto[];
    /** managerId → «Фамилия Имя»; нет в карте → «#id». */
    managerNames: ReadonlyMap<string, string>;
}

export interface DigestMessageInput {
    /** День, за который собран разбор (YYYY-MM-DD, TZ портала). */
    day: string;
    timeZone: string;
    items: readonly DigestItem[];
    /** transcriptionId → ссылка на карточку разбора (null — нет). */
    links: ReadonlyMap<string, string | null>;
    /** Имя менеджера — только при ручной отправке «себе» (чей разбор). */
    managerName?: string | null;
}

export const AGENDA_MESSAGE_TITLE = 'Повестка планёрки';
export const DIGEST_MESSAGE_TITLE = 'Вчерашние звонки: что сказать иначе';

/** Название типа звонка из справочника смарта; неизвестный — код. */
export function callTypeTitle(callType: string | null): string {
    if (!callType) return 'тип не определён';
    return (
        CALL_REPORT_CALL_TYPE_ITEMS.find(item => item.CODE === callType)
            ?.VALUE ?? callType
    );
}

/** Название раздела разговора из справочника смарта; неизвестный — код. */
export function sectionTitle(section: string): string {
    return (
        CALL_REPORT_SECTIONS.find(item => item.code === section)?.title ??
        section
    );
}

/** Имя менеджера из карты либо «#id»; без id — «менеджер не определён». */
export function managerLabel(
    managerId: string | null,
    names: ReadonlyMap<string, string>,
): string {
    if (!managerId) return 'менеджер не определён';
    return names.get(managerId) ?? `#${managerId}`;
}

export function truncateQuote(text: string): string {
    const clean = text.trim();
    if (clean.length <= AI_ANALYTICS_PUSH_QUOTE_MAX_LENGTH) return clean;
    return `${clean.slice(0, AI_ANALYTICS_PUSH_QUOTE_MAX_LENGTH - 1).trimEnd()}…`;
}

/** «04.09, 11:20» в TZ портала. */
export function formatCallTime(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(date);
}

/** «04.09.2026» из YYYY-MM-DD. */
export function formatPortalDay(day: string): string {
    const [year, month, date] = day.split('-');
    return year && month && date ? `${date}.${month}.${year}` : day;
}

/** «04.09» из YYYY-MM-DD — короткая дата внутри заголовка. */
const formatDayMonth = (day: string): string =>
    formatPortalDay(day).slice(0, 5);

/**
 * Заголовок повестки словами: weekKey — ТЕКУЩАЯ неделя планёрки, звонки
 * в ней — за предыдущую полную ISO-неделю: «Повестка планёрки (неделя с
 * 22.09): звонки за 15–21.09». Не ключ недели — как есть, без дат.
 */
export function agendaMessageHeadline(weekKey: string): string {
    if (!isIsoWeekKey(weekKey)) {
        return `${AGENDA_MESSAGE_TITLE}: звонки недели ${weekKey}`;
    }
    const monday = mondayOfIsoWeek(weekKey);
    const callsFrom = formatDayMonth(shiftDate(monday, -7));
    const callsTo = formatDayMonth(shiftDate(monday, -1));
    return (
        `${AGENDA_MESSAGE_TITLE} (неделя с ${formatDayMonth(monday)}): ` +
        `звонки за ${callsFrom}–${callsTo}`
    );
}

const nonNull = (line: string | null): line is string => line !== null;

/**
 * Повестка РОПу: заголовок, 3 звонка (менеджер, тип, причина, цитата,
 * ссылка) и пункт «Несогласия недели».
 */
export function buildAgendaMessage(input: AgendaMessageInput): string {
    const head = `[B]${agendaMessageHeadline(input.weekKey)}[/B]`;
    const calls = input.items.flatMap((item, index) =>
        [
            `${index + 1}. ${managerLabel(item.managerId, input.managerNames)} — ${callTypeTitle(item.callType)}`,
            `   Причина: ${item.reason}`,
            item.quote ? `   Цитата: «${truncateQuote(item.quote)}»` : null,
            item.link ? `   Разбор: ${item.link}` : null,
        ].filter(nonNull),
    );
    const disagreements = input.disagreements.length
        ? [
              `Несогласия недели: ${input.disagreements.length}`,
              ...input.disagreements.map(
                  record =>
                      `— ${managerLabel(record.managerId, input.managerNames)} · ${feedbackObjectLabel(record.object)}` +
                      (record.reason
                          ? `: ${truncateQuote(record.reason)}`
                          : ''),
              ),
          ]
        : ['Несогласия недели: нет'];
    return [head, ...calls, '', ...disagreements].join('\n');
}

/**
 * Утренний разбор менеджеру: 1–3 вчерашних звонка с худшим разделом,
 * «как было» и до трёх дословных фраз «как можно иначе», ссылка на разбор.
 */
export function buildDigestMessage(input: DigestMessageInput): string {
    const head = `[B]${DIGEST_MESSAGE_TITLE}[/B] (${formatPortalDay(input.day)})`;
    const whose = input.managerName ? [`Менеджер: ${input.managerName}`] : [];
    const calls = input.items.flatMap((item, index) => {
        const link = input.links.get(item.transcriptionId) ?? null;
        return [
            `${index + 1}. ${formatCallTime(item.callStartedAt, input.timeZone)} · ${sectionTitle(item.section)}`,
            item.asWas ? `   Было: «${truncateQuote(item.asWas)}»` : null,
            '   Иначе:',
            ...item.alternatives.map(phrase => `   — ${truncateQuote(phrase)}`),
            link ? `   Разбор: ${link}` : null,
        ].filter(nonNull);
    });
    return [head, ...whose, ...calls].join('\n');
}
