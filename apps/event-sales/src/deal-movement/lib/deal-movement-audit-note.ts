import { dealMovementDaysText } from '@lib/sales-ai-analytics';
import {
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_FLAG_LABEL,
    DealAuditFlagCode,
} from '../../deal-audit/constants/deal-audit.const';
import {
    DEAL_AUDIT_FREQUENCY,
    type DealAuditFrequency,
} from '../../deal-audit/lib/deal-audit-schedule';
import type { DealAuditFinding } from '../../deal-audit/services/deal-audit-findings.store';

/**
 * Находки аудита сделок в сводке «Движение сделок» (решение 18.11.2026):
 * пометка под причинами у сделки — «ещё и по аудиту: …», до двух признаков
 * словами, только свежие находки. Статус сделки она НЕ меняет. Чистые
 * функции.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Находка свежая, если не старше — по частоте аудита на портале. */
export const DEAL_MOVEMENT_AUDIT_MAX_AGE_DAYS: Readonly<
    Record<DealAuditFrequency, number>
> = {
    [DEAL_AUDIT_FREQUENCY.weekly]: 8,
    [DEAL_AUDIT_FREQUENCY.monthly]: 32,
};

/** Признаки по важности: сначала как статусы аудита, затем остальные. */
const FLAG_ORDER: readonly DealAuditFlagCode[] = [
    DEAL_AUDIT_FLAG.forgotClose,
    DEAL_AUDIT_FLAG.noTask,
    DEAL_AUDIT_FLAG.taskOverdue,
    DEAL_AUDIT_FLAG.idle,
    DEAL_AUDIT_FLAG.stageStuck,
    DEAL_AUDIT_FLAG.taskNoDeadline,
    DEAL_AUDIT_FLAG.nextDatePast,
    DEAL_AUDIT_FLAG.nextDateEmpty,
    DEAL_AUDIT_FLAG.noResponsible,
];

/** Сколько признаков показывать в пометке. */
const FLAGS_SHOWN = 2;

export const DEAL_MOVEMENT_AUDIT_NOTE_PREFIX = 'ещё и по аудиту';

/** Признак словами; где известно число дней — с числом. */
function flagText(flag: DealAuditFlagCode, finding: DealAuditFinding): string {
    if (flag === DEAL_AUDIT_FLAG.idle && finding.idleDays !== null) {
        return `нет работы ${dealMovementDaysText(finding.idleDays)}`;
    }
    if (flag === DEAL_AUDIT_FLAG.taskOverdue && finding.overdueDays > 0) {
        return `задача просрочена на ${dealMovementDaysText(finding.overdueDays)}`;
    }
    return DEAL_AUDIT_FLAG_LABEL[flag];
}

/** Свежие находки портала: не старше срока для частоты аудита. */
export function freshDealAuditFindings(
    findings: ReadonlyMap<string, DealAuditFinding>,
    now: Date,
    frequency: DealAuditFrequency,
): Map<string, DealAuditFinding> {
    const maxAgeMs = DEAL_MOVEMENT_AUDIT_MAX_AGE_DAYS[frequency] * DAY_MS;
    const fresh = new Map<string, DealAuditFinding>();
    for (const [dealId, finding] of findings) {
        const at = Date.parse(finding.at);
        if (!Number.isNaN(at) && now.getTime() - at <= maxAgeMs) {
            fresh.set(dealId, finding);
        }
    }
    return fresh;
}

/** Находки портала → пометки свежих находок по id сделки. */
export function dealAuditNotesOf(
    findings: ReadonlyMap<string, DealAuditFinding>,
    now: Date,
    frequency: DealAuditFrequency,
): Map<string, string> {
    const notes = new Map<string, string>();
    for (const [dealId, finding] of freshDealAuditFindings(
        findings,
        now,
        frequency,
    )) {
        const note = dealMovementAuditNote(finding);
        if (note !== null) notes.set(dealId, note);
    }
    return notes;
}

/** «ещё и по аудиту: без задач, нет работы 18 дней»; признаков нет — null. */
export function dealMovementAuditNote(
    finding: DealAuditFinding,
): string | null {
    const shown = FLAG_ORDER.filter(flag => finding.flags.includes(flag))
        .slice(0, FLAGS_SHOWN)
        .map(flag => flagText(flag, finding));
    return shown.length > 0
        ? `${DEAL_MOVEMENT_AUDIT_NOTE_PREFIX}: ${shown.join(', ')}`
        : null;
}
