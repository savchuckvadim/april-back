import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { markedOf } from './owner-report.overview';
import { advancedShare, shareWhere } from './owner-report.share';
import type {
    OwnerReportCall,
    OwnerReportPresentationManagerRow,
    OwnerReportPresentations,
    OwnerReportSectionScore,
} from './owner-report.types';

/**
 * Раздел «Презентации» (просьба владельца 09.11.2026: сводка качества
 * показов в PDF — потребности, показ под задачи, закрытие, оценки
 * разделов). Главная пара чисел — шаг вперёд после показа под задачи
 * клиента против шаблонного: это то, что в образце звучит как «59 %
 * против 26 %». Показ — разговоры группы `presentation`.
 */

const PRESENTATION_GROUP = 'presentation';

/** Средние оценки разделов по показам, где раздел применим; порядок справочника. */
export function sectionAverages(
    calls: readonly OwnerReportCall[],
): OwnerReportSectionScore[] {
    return CALL_REPORT_SECTION_CODES.flatMap(section => {
        const scores = calls.flatMap(call => {
            const score = call.sectionScores[section];
            return score === undefined ? [] : [score];
        });
        if (scores.length === 0) return [];
        return [
            {
                section,
                avg:
                    scores.reduce((sum, score) => sum + score, 0) /
                    scores.length,
                n: scores.length,
            },
        ];
    });
}

function managerRows(
    calls: readonly OwnerReportCall[],
): OwnerReportPresentationManagerRow[] {
    const ids = [...new Set(calls.map(call => call.managerId))];
    return ids
        .map(managerId => {
            const rows = calls.filter(call => call.managerId === managerId);
            return {
                managerId,
                calls: rows.length,
                advanced: advancedShare(rows),
                byNeeds: shareWhere(rows, call => call.presentationByNeeds),
            };
        })
        .sort(
            (a, b) =>
                b.calls - a.calls || a.managerId.localeCompare(b.managerId),
        );
}

export function buildPresentations(
    calls: readonly OwnerReportCall[],
): OwnerReportPresentations {
    const rows = calls.filter(call => call.typeGroup === PRESENTATION_GROUP);
    const byNeeds = rows.filter(call => call.presentationByNeeds === true);
    const template = rows.filter(call => call.presentationByNeeds === false);
    return {
        calls: rows.length,
        marked: markedOf(rows).length,
        advanced: advancedShare(rows),
        needsFound: shareWhere(rows, call => call.needsFound),
        byNeeds: shareWhere(rows, call => call.presentationByNeeds),
        advancedByNeeds: advancedShare(byNeeds),
        advancedTemplate: advancedShare(template),
        closingAttempted: shareWhere(rows, call => call.closingAttempted),
        nextStepDated: shareWhere(rows, call => call.nextStepDated),
        objectionsHandled: shareWhere(
            rows.flatMap(call => call.objections),
            objection => objection.handled,
        ),
        sectionScores: sectionAverages(rows),
        byManager: managerRows(rows),
    };
}
