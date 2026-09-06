/**
 * Сигналы руководителю для пульса: звонки окна с риск-флагом разбора или
 * срочным приоритетом коучинга, плюс звонки, по которым event-sales уже
 * отправил алерт (ais kind = alert_sent). handled — есть alert_handled.
 * Чистые функции над lite-строками.
 */
import {
    CALL_REPORT_RISK_FLAG_CODES,
    CallReportRiskFlagCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    nonEmptyText,
    pickWorstSection,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_URGENT_COACHING,
    AiAnalyticsAlertKind,
} from '../../constants/ai-analytics.const';
import { AiPulseAlertDto } from '../../dto/ai-pulse.dto';
import { DatedLiteRow } from '../loaders/lite-row.mapper';

export const ALERT_QUOTE_MAX_LENGTH = 300;

const isRiskFlag = (value: string): value is CallReportRiskFlagCode =>
    (CALL_REPORT_RISK_FLAG_CODES as readonly string[]).includes(value);

/** Вид сигнала: первый риск-флаг по порядку справочника, иначе urgent, иначе null. */
export function resolveAlertKind(
    row: Pick<DatedLiteRow, 'riskFlags' | 'coachingPriority'>,
): AiAnalyticsAlertKind | null {
    const flag = CALL_REPORT_RISK_FLAG_CODES.find(code =>
        row.riskFlags.some(item => item === code && isRiskFlag(item)),
    );
    if (flag) return flag;
    return row.coachingPriority === AI_ANALYTICS_URGENT_COACHING
        ? AI_ANALYTICS_URGENT_COACHING
        : null;
}

/** Цитата: первое возражение с текстом, иначе «как было» худшего раздела. */
export function pickAlertQuote(
    row: Pick<DatedLiteRow, 'objections' | 'sections'>,
): string {
    const objection = row.objections
        .map(item => nonEmptyText(item.quote))
        .find((quote): quote is string => quote !== null);
    const quote = objection ?? pickWorstSection(row.sections)?.asWas ?? '';
    return quote.length > ALERT_QUOTE_MAX_LENGTH
        ? `${quote.slice(0, ALERT_QUOTE_MAX_LENGTH - 1)}…`
        : quote;
}

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
): AiPulseAlertDto[] {
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
