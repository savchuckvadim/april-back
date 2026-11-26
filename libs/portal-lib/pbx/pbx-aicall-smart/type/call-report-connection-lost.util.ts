import {
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
} from './pbx-aicall-report-facts.type';
import type { CallReportSectionCode } from './pbx-aicall-smart.type';

/**
 * Разделы разбора, до которых при обрыве связи разговор не дошёл: закрытие и
 * работа с отказом. Код делает их неактуальными, а ограничители с такой
 * целью при обрыве не срабатывают — менеджера за них не винят.
 */
export const CALL_REPORT_CONNECTION_LOST_UNREACHED_SECTIONS = [
    'CLOSING',
    'REFUSAL',
] as const satisfies readonly CallReportSectionCode[];

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
 * Оборвалось до результата: исход разбора — «связь прервалась». Уже, чем
 * `isConnectionLostReported`: звонки, где до обрыва успели договориться или
 * получить отказ, сюда не входят.
 */
export function isConnectionLostOutcome(
    facts: Pick<CallReportConnectionLostSource, 'outcome'> | null | undefined,
): boolean {
    return facts?.outcome === CALL_REPORT_OUTCOME_CONNECTION_LOST;
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
