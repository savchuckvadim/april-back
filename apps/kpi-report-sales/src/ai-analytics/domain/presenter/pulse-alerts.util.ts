/**
 * Сигналы руководителю для пульса и «Внимания»: звонки окна, где разбор
 * нашёл ОШИБКУ МЕНЕДЖЕРА (решение владельца 11.11.2026, правило
 * resolveManagerSignal из @lib/sales-ai-analytics — одно с уведомлением
 * РОПу в CRM): действующий риск-флаг с цитатой (conflict / compliance /
 * door_closed), возражение не отработано, показ без потребностей или без
 * «свойство — связка — выгода». Возражение клиента само по себе и срочный
 * приоритет коучинга сигналом не считаются. Плюс звонки, по которым
 * event-sales уже отправил алерт (ais kind = alert_sent) — у отправленных
 * до 11.11 вида по новому правилу может не быть, они идут как urgent.
 * handled — есть alert_handled. Чистые функции над lite-строками.
 */
import { CALL_REPORT_ACTIVE_RISK_FLAG_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    isActiveRiskKind,
    ManagerSignal,
    ManagerSignalCallView,
    pickWorstSection,
    resolveManagerSignal,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_URGENT_COACHING,
    AiAnalyticsAlertKind,
} from '../../constants/ai-analytics.const';
import { AiPulseAlertDto } from '../../dto/ai-pulse.dto';
import { DatedLiteRow } from '../loaders/lite-row.mapper';

export const ALERT_QUOTE_MAX_LENGTH = 300;

/** Вид сигнала считается: действующий флаг, ошибка менеджера или старый urgent. */
export const isActiveAlertKind = (kind: string): kind is AiAnalyticsAlertKind =>
    isActiveRiskKind(kind);

/** Поля lite-строки, по которым решается сигнал. */
export type AlertSourceRow = Pick<
    DatedLiteRow,
    'riskFlags' | 'riskEvidence' | 'objections' | 'sections'
> &
    Partial<Pick<DatedLiteRow, 'style' | 'methodology'>>;

/** Проекция lite-строки для правила сигнала; старые строки без style/methodology — null. */
export function toSignalView(row: AlertSourceRow): ManagerSignalCallView {
    return {
        riskFlags: row.riskFlags,
        riskEvidence: row.riskEvidence ?? [],
        objections: row.objections,
        sections: row.sections,
        presentationDone: row.style?.presentationDone ?? null,
        needsFound: row.style?.needsFound ?? null,
        spiralsFull: row.methodology?.spiralsFull ?? null,
    };
}

/** Сигнал по звонку: витрина учитывает все действующие флаги, включая «дверь закрыта». */
export const resolveAlertSignal = (row: AlertSourceRow): ManagerSignal | null =>
    resolveManagerSignal(toSignalView(row), CALL_REPORT_ACTIVE_RISK_FLAG_CODES);

/** Вид сигнала по разбору или null — повода для руководителя нет. */
export const resolveAlertKind = (
    row: AlertSourceRow,
): AiAnalyticsAlertKind | null => resolveAlertSignal(row)?.kind ?? null;

const truncate = (quote: string): string =>
    quote.length > ALERT_QUOTE_MAX_LENGTH
        ? `${quote.slice(0, ALERT_QUOTE_MAX_LENGTH - 1)}…`
        : quote;

/**
 * Цитата сигнала: доказательство правила (цитата флага, слова клиента в
 * неотработанном возражении, «как было» менеджера в показе), иначе — у
 * старого отправленного алерта — «как было» худшего раздела.
 */
function alertQuote(
    signal: ManagerSignal | null,
    row: Pick<DatedLiteRow, 'sections'>,
): string {
    const quote =
        signal?.quote?.trim() || pickWorstSection(row.sections)?.asWas || '';
    return truncate(quote);
}

/** Цитата сигнала строки (см. alertQuote). */
export const pickAlertQuote = (row: AlertSourceRow): string =>
    alertQuote(resolveAlertSignal(row), row);

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
 * Алерты окна [from; to] (дни портала): ошибка менеджера по разбору либо
 * уже отправленный алерт. Сортировка — по времени звонка, затем по id.
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
            const signal = resolveAlertSignal(row);
            const kind: AiAnalyticsAlertKind | null =
                signal?.kind ??
                (marks.sent.has(row.transcriptionId)
                    ? AI_ANALYTICS_URGENT_COACHING
                    : null);
            if (!kind) return [];
            return [
                {
                    managerId: row.managerId,
                    transcriptionId: row.transcriptionId,
                    kind,
                    quote: alertQuote(signal, row),
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
