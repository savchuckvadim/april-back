/**
 * Чистые проекции lite-строки звонка (call-lib loadLite) в строки модели
 * @lib/sales-ai-analytics. Строки без времени звонка отбрасываются —
 * без даты их нельзя положить ни в окно, ни в неделю.
 */
import { AnalyticsCallLiteRow } from '@lib/call-lib';
import { AgendaCallRow, PulseCallRow } from '@lib/sales-ai-analytics';

/** Lite-строка с известным временем звонка. */
export type DatedLiteRow = AnalyticsCallLiteRow & { callStartedAt: Date };

export const hasCallDate = (row: AnalyticsCallLiteRow): row is DatedLiteRow =>
    row.callStartedAt instanceof Date &&
    !Number.isNaN(row.callStartedAt.getTime());

export function toPulseRow(row: DatedLiteRow): PulseCallRow {
    return {
        transcriptionId: row.transcriptionId,
        managerId: row.managerId,
        callStartedAt: row.callStartedAt,
        durationSec: row.durationSec,
        // Тип нужен пульсу только для порога длительности по типу (А.1).
        callType: row.callType,
        analysisPresent: row.analysisPresent,
        nextStep: row.nextStep,
        riskFlags: row.riskFlags,
        coachingPriority: row.coachingPriority,
    };
}

/** Текст транскрипта lite-выборка не грузит → text = null, charOffset = null. */
export function toAgendaRow(row: DatedLiteRow): AgendaCallRow {
    return {
        transcriptionId: row.transcriptionId,
        managerId: row.managerId,
        callType: row.callType,
        callStartedAt: row.callStartedAt,
        score: row.score,
        sections: row.sections,
        objections: row.objections,
        riskFlags: row.riskFlags,
        text: null,
    };
}
