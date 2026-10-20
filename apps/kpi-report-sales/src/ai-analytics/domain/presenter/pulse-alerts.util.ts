/**
 * Сигналы руководителю для пульса: звонки окна с ДЕЙСТВУЮЩИМ риск-флагом
 * разбора, подтверждённым цитатой (conflict / compliance / door_closed),
 * или срочным приоритетом коучинга, плюс звонки, по которым event-sales
 * уже отправил алерт (ais kind = alert_sent). handled — есть alert_handled.
 * Отменённые флаги (promise, client_negative) и флаги без цитаты сигналом
 * не считаются даже в старых данных (решение владельца 19–20.10.2026).
 * Чистые функции над lite-строками.
 */
import {
    isActiveRiskKind,
    nonEmptyText,
    pickWorstSection,
    provenRiskFlags,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_URGENT_COACHING,
    AiAnalyticsAlertKind,
} from '../../constants/ai-analytics.const';
import { AiPulseAlertDto } from '../../dto/ai-pulse.dto';
import { DatedLiteRow } from '../loaders/lite-row.mapper';

export const ALERT_QUOTE_MAX_LENGTH = 300;

/** Вид сигнала считается: действующий флаг либо urgent (старый кэш может нести отменённые). */
export const isActiveAlertKind = (kind: string): kind is AiAnalyticsAlertKind =>
    isActiveRiskKind(kind);

/**
 * Вид сигнала: первый действующий риск-флаг с цитатой по порядку
 * справочника, иначе urgent, иначе null.
 */
export function resolveAlertKind(
    row: Pick<DatedLiteRow, 'riskFlags' | 'riskEvidence' | 'coachingPriority'>,
): AiAnalyticsAlertKind | null {
    const [proven] = provenRiskFlags(row.riskFlags, row.riskEvidence);
    if (proven) return proven.flag;
    return row.coachingPriority === AI_ANALYTICS_URGENT_COACHING
        ? AI_ANALYTICS_URGENT_COACHING
        : null;
}

const truncate = (quote: string): string =>
    quote.length > ALERT_QUOTE_MAX_LENGTH
        ? `${quote.slice(0, ALERT_QUOTE_MAX_LENGTH - 1)}…`
        : quote;

/**
 * Цитата сигнала: доказательство флага (если сигнал по флагу), иначе первое
 * возражение с текстом, иначе «как было» худшего раздела.
 */
export function pickAlertQuote(
    row: Pick<DatedLiteRow, 'objections' | 'sections'> &
        Partial<Pick<DatedLiteRow, 'riskFlags' | 'riskEvidence'>>,
): string {
    const [proven] = provenRiskFlags(row.riskFlags, row.riskEvidence);
    if (proven) return truncate(proven.quote);
    const objection = row.objections
        .map(item => nonEmptyText(item.quote))
        .find((quote): quote is string => quote !== null);
    const quote = objection ?? pickWorstSection(row.sections)?.asWas ?? '';
    return truncate(quote);
}

/**
 * Сигнал без ссылки на карточку разбора: ссылки проставляет use-case после
 * резолва SmartLinkLoader (withPulseAlertLinks в pulse.presenter).
 */
export type PulseAlertDraft = Omit<AiPulseAlertDto, 'link'>;

export interface AlertMarks {
    /** transcriptionId звонков с ais alert_sent. */
    sent: ReadonlySet<string>;
    /** transcriptionId звонков с ais alert_handled. */
    handled: ReadonlySet<string>;
}

/**
 * Алерты окна [from; to] (дни портала): риск/urgent по разбору либо уже
 * отправленный алерт. Сортировка — по времени звонка, затем по id.
 */
export function collectPulseAlerts(
    rows: readonly DatedLiteRow[],
    window: { from: string; to: string },
    timeZone: string,
    marks: AlertMarks,
): PulseAlertDraft[] {
    return rows
        .filter(row => {
            const day = toPortalDate(row.callStartedAt, timeZone);
            return day >= window.from && day <= window.to;
        })
        .flatMap(row => {
            const kind =
                resolveAlertKind(row) ??
                (marks.sent.has(row.transcriptionId)
                    ? AI_ANALYTICS_URGENT_COACHING
                    : null);
            if (!kind) return [];
            return [
                {
                    managerId: row.managerId,
                    transcriptionId: row.transcriptionId,
                    kind,
                    quote: pickAlertQuote(row),
                    callStartedAt: row.callStartedAt.toISOString(),
                    handled: marks.handled.has(row.transcriptionId),
                },
            ];
        })
        .sort(
            (a, b) =>
                a.callStartedAt.localeCompare(b.callStartedAt) ||
                a.transcriptionId.localeCompare(b.transcriptionId),
        );
}
