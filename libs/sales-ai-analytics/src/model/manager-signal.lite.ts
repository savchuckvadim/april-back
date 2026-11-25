/**
 * Сигнал руководителю по lite-строке разбора звонка: проекция строки в
 * объём правила resolveManagerSignal. Переехала из kpi-report-sales
 * (pulse-alerts.util), чтобы одно и то же правило читали и пульс, и
 * бейджи списка разборов.
 */
import type { AnalyticsCallLiteRow } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import { CALL_REPORT_ACTIVE_RISK_FLAG_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    ManagerSignal,
    ManagerSignalCallView,
    resolveManagerSignal,
} from './manager-signal.rules';

/** Поля lite-строки, по которым решается сигнал руководителю. */
export type SignalSourceRow = Pick<
    AnalyticsCallLiteRow,
    'riskFlags' | 'riskEvidence' | 'objections' | 'sections'
> &
    Partial<Pick<AnalyticsCallLiteRow, 'style' | 'methodology'>>;

/** Проекция lite-строки для правила сигнала; старые строки без style/methodology — null. */
export function toSignalView(row: SignalSourceRow): ManagerSignalCallView {
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

/** Сигнал по звонку для витрины: учитываются все действующие риск-флаги. */
export const resolveLiteSignal = (row: SignalSourceRow): ManagerSignal | null =>
    resolveManagerSignal(toSignalView(row), CALL_REPORT_ACTIVE_RISK_FLAG_CODES);
