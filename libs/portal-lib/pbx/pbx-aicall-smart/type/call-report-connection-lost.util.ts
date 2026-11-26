import {
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
} from './pbx-aicall-report-facts.type';

/**
 * Факты разбора, из которых видно обрыв связи. Структурный тип: подходит и
 * лёгкой проекции `AnalyticsLiteReportFacts`, и DTO разбора из agent-gate
 * (код исхода и сбоя там строками справочника).
 */
export interface CallReportConnectionLostSource {
    outcome?: string | null;
    issues?: readonly { code: string }[] | null;
}

/**
 * В разборе отмечен обрыв связи: исход «связь прервалась» ИЛИ среди сбоев
 * есть «связь прервалась». Пустые факты (нет разбора, старый разбор) — false.
 */
export function isConnectionLostReported(
    facts: CallReportConnectionLostSource | null | undefined,
): boolean {
    if (!facts) return false;
    if (facts.outcome === CALL_REPORT_OUTCOME_CONNECTION_LOST) return true;
    return (facts.issues ?? []).some(
        issue => issue.code === CALL_REPORT_ISSUE_CONNECTION_LOST,
    );
}
