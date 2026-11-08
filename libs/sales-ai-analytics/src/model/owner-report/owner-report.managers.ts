import { postponedWithDate } from './owner-report.overview';
import {
    advancedShare,
    shareOf,
    shareWhere,
    talkedOf,
} from './owner-report.share';
import type {
    OwnerReportCall,
    OwnerReportCrmFacts,
    OwnerReportManagerRow,
} from './owner-report.types';

/**
 * Таблица «Сотрудники»: по каждому менеджеру объём, конверсии по группам,
 * качество диалога и дисциплина шага, доля в продвижениях и допродажах
 * команды, CRM-факты. Без рейтингов напоказ: место в отделе словами даёт
 * формулировщик (решение владельца 07.09.2026).
 */

export function buildManagerRows(
    calls: readonly OwnerReportCall[],
    crm: OwnerReportCrmFacts | null,
): OwnerReportManagerRow[] {
    const teamAdvanced = calls.filter(call => call.advanced === true).length;
    const teamUpsell = calls.filter(
        call => call.upsellAttempted === true,
    ).length;
    const managerIds = [...new Set(calls.map(call => call.managerId))];
    return managerIds
        .map(managerId =>
            managerRow(
                managerId,
                calls.filter(call => call.managerId === managerId),
                {
                    calls: calls.length,
                    advanced: teamAdvanced,
                    upsell: teamUpsell,
                },
                crm?.byManager[managerId] ?? null,
            ),
        )
        .sort(
            (a, b) =>
                b.calls - a.calls || a.managerId.localeCompare(b.managerId),
        );
}

function managerRow(
    managerId: string,
    rows: readonly OwnerReportCall[],
    team: { calls: number; advanced: number; upsell: number },
    crm: OwnerReportManagerRow['crm'],
): OwnerReportManagerRow {
    const contacted = talkedOf(rows);
    const advancedIn = (group: OwnerReportCall['typeGroup']) =>
        advancedShare(rows.filter(call => call.typeGroup === group));
    const scores = rows.flatMap(call =>
        call.score === null ? [] : [call.score],
    );
    return {
        managerId,
        calls: rows.length,
        shareOfTeam: shareOf(rows.length, team.calls),
        coldAdvanced: advancedIn('cold'),
        contactedAdvanced: advancedShare(
            rows.filter(call => call.contactReached === true),
        ),
        reactivationAdvanced: advancedIn('reactivation'),
        needsFound: shareWhere(contacted, call => call.needsFound),
        presentationByNeeds: shareWhere(rows, call => call.presentationByNeeds),
        closingAttempted: shareWhere(contacted, call => call.closingAttempted),
        nextStepDated: shareWhere(contacted, call => call.nextStepDated),
        objectionsHandled: shareWhere(
            contacted.flatMap(call => call.objections),
            objection => objection.handled,
        ),
        postponedWithDate: postponedWithDate(rows),
        conflict: shareWhere(rows, call => call.conflict),
        evasive: shareWhere(rows, call => call.evasive),
        advancedShareOfTeam: shareOf(
            rows.filter(call => call.advanced === true).length,
            team.advanced,
        ),
        upsellShareOfTeam: shareOf(
            rows.filter(call => call.upsellAttempted === true).length,
            team.upsell,
        ),
        avgScore:
            scores.length > 0
                ? scores.reduce((sum, score) => sum + score, 0) / scores.length
                : null,
        issues: rows.filter(call => (call.issues?.length ?? 0) > 0).length,
        crm,
    };
}
