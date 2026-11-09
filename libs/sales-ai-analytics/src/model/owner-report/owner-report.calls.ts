import { CALL_REPORT_OUTCOME_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import { isBelowMinDuration, minDurationMapOf } from '../manager-type-matrix';
import type { MinDurationSecByType } from '../pulse-duration';
import { isoWeekday, shiftDate, toPortalDate } from '../workdays.util';
import type {
    OwnerReportCall,
    OwnerReportCallInput,
    OwnerReportOutcome,
    OwnerReportPrice,
    OwnerReportTypeGroup,
} from './owner-report.types';

/**
 * Нормализация lite-строк звонков в единицу счётчиков отчёта собственнику.
 * Старый разбор без фактов focus-v3.1 не выбрасывается: всё, что он знает
 * (задачи клиента, шаг с датой, возражения, закрытие), идёт в доли как
 * есть; исход, сбои, допродажа и темы возражений у него null — «не
 * размечено», а не «нет». Угадывать исход по косвенным полям нельзя:
 * 07.11.2026 такой вывод записал 54 из 70 октябрьских разговоров в
 * «отложено без даты» и родил ложную главную утечку.
 */

/** Группа типа: дожим = доработка, решение, оплата. */
const TYPE_GROUP_BY_CALL_TYPE: Readonly<Record<string, OwnerReportTypeGroup>> =
    {
        cold: 'cold',
        site_lead: 'site_lead',
        presentation: 'presentation',
        refine: 'followup',
        decision: 'followup',
        payment: 'followup',
        event_invite: 'event_invite',
    };

/** Собеседник старого разбора, при котором разговор считается разговором с ЛПР. */
const CONTACT_ROLES: ReadonlySet<string> = new Set(['lpr', 'user']);
/** Собеседник, при котором до ЛПР не дошли. */
const NO_CONTACT_ROLES: ReadonlySet<string> = new Set(['secretary']);

/** Оценка раздела «Закрытие» (1–10), с которой попытка закрытия засчитана. */
const CLOSING_ATTEMPT_MIN_SCORE = 5;

const OUTCOME_CODES: ReadonlySet<string> = new Set(CALL_REPORT_OUTCOME_CODES);

export interface NormalizeResult {
    calls: OwnerReportCall[];
    short: number;
    noManager: number;
    noAnalysis: number;
    /** Строк вне периода или без даты. */
    outside: number;
}

export interface NormalizeOptions {
    from: string;
    to: string;
    timeZone: string;
    minDurationByType?: MinDurationSecByType;
    managerIds?: readonly string[];
}

/** Lite-строки → звонки отчёта; строки вне периметра и периода отбрасываются. */
export function normalizeOwnerReportCalls(
    rows: readonly OwnerReportCallInput[],
    options: NormalizeOptions,
): NormalizeResult {
    const byType = minDurationMapOf(undefined, options.minDurationByType);
    const scope = options.managerIds ? new Set(options.managerIds) : null;
    const result: NormalizeResult = {
        calls: [],
        short: 0,
        noManager: 0,
        noAnalysis: 0,
        outside: 0,
    };
    for (const row of rows) {
        const date = dateOf(row, options.timeZone);
        if (date === null || date < options.from || date > options.to) {
            result.outside += 1;
            continue;
        }
        if (row.managerId === null || (scope && !scope.has(row.managerId))) {
            if (row.managerId === null) result.noManager += 1;
            continue;
        }
        if (isBelowMinDuration(row, byType)) {
            result.short += 1;
            continue;
        }
        if (!row.analysisPresent) {
            result.noAnalysis += 1;
            continue;
        }
        result.calls.push(toOwnerReportCall(row, row.managerId, date));
    }
    return result;
}

function dateOf(row: OwnerReportCallInput, timeZone: string): string | null {
    const at = row.callStartedAt;
    if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;
    return toPortalDate(at, timeZone);
}

/** Понедельник ISO-недели дня. */
export function mondayOf(date: string): string {
    return shiftDate(date, 1 - isoWeekday(date));
}

function toOwnerReportCall(
    row: OwnerReportCallInput,
    managerId: string,
    date: string,
): OwnerReportCall {
    const outcome = outcomeOf(row);
    const marked = outcome !== null;
    const nextStepSet = row.nextStep?.set === true;
    const nextStepKind = row.nextStep?.kind ?? null;
    const style = row.style;
    const closing = row.sections.find(
        section => section.section === 'CLOSING' && section.relevance > 0,
    );
    return {
        transcriptionId: row.transcriptionId,
        managerId,
        date,
        weekKey: mondayOf(date),
        callType: row.callType,
        typeGroup: typeGroupOf(row),
        marked,
        outcome,
        contactReached: contactOf(row, outcome),
        advanced: outcome === null ? null : outcome === 'advanced',
        nextStepSet,
        nextStepDated: nextStepSet && typeof row.nextStep?.date === 'string',
        nextStepKind,
        objections: row.objections.map(objection => ({
            topic: objection.topic ?? (marked ? 'other' : null),
            handled: objection.handled,
            outcome: objection.outcome,
        })),
        issues: marked
            ? (row.report?.issues ?? []).map(issue => issue.code)
            : null,
        prices: (row.report?.prices ?? []).map(priceOf),
        upsellAttempted: marked ? (row.report?.upsellAttempted ?? null) : null,
        needsFound: style?.needsFound ?? null,
        presentationByNeeds: presentationByNeedsOf(row),
        closingAttempted:
            closing && closing.score !== null
                ? closing.score >= CLOSING_ATTEMPT_MIN_SCORE
                : null,
        conflict: row.riskFlags.includes('conflict'),
        evasive: row.report?.selfIntro
            ? row.report.selfIntro.offerQuestion === 'evasive'
            : null,
        score: row.score,
        sectionScores: sectionScoresOf(row),
    };
}

/** Оценки применимых разделов (актуальность > 0, оценка есть) по коду раздела. */
function sectionScoresOf(
    row: OwnerReportCallInput,
): Readonly<Record<string, number>> {
    const scores: Record<string, number> = {};
    for (const section of row.sections) {
        if (section.relevance > 0 && section.score !== null) {
            scores[section.section] = section.score;
        }
    }
    return scores;
}

export function typeGroupOf(
    row: Pick<OwnerReportCallInput, 'callType' | 'reactivation'>,
): OwnerReportTypeGroup {
    if (row.reactivation === true) return 'reactivation';
    if (!row.callType) return 'other';
    return TYPE_GROUP_BY_CALL_TYPE[row.callType] ?? 'other';
}

/** Исход разговора из разбора focus-v3.1; нет или код чужой — null. */
export function outcomeOf(
    row: OwnerReportCallInput,
): OwnerReportOutcome | null {
    const fromAnalysis = row.report?.outcome ?? null;
    return fromAnalysis !== null && OUTCOME_CODES.has(fromAnalysis)
        ? (fromAnalysis as OwnerReportOutcome)
        : null;
}

/**
 * Состоялся ли разговор с ЛПР: по исходу; без исхода — по собеседнику
 * старого разбора (ЛПР или пользователь — да, секретарь — нет); иначе null.
 */
function contactOf(
    row: OwnerReportCallInput,
    outcome: OwnerReportOutcome | null,
): boolean | null {
    if (outcome !== null) return outcome !== 'no_contact';
    const role = row.style?.interlocutorRole ?? null;
    if (role !== null && CONTACT_ROLES.has(role)) return true;
    if (role !== null && NO_CONTACT_ROLES.has(role)) return false;
    return null;
}

/**
 * Презентация под потребности: полные спирали методики не ниже минимума;
 * без методики — показ состоялся после выявленных потребностей. Нет
 * показа — null (признак не применим).
 */
function presentationByNeedsOf(row: OwnerReportCallInput): boolean | null {
    const spirals = row.methodology?.spiralsFull ?? null;
    const minFull = row.methodology?.spiralsMinFull ?? null;
    if (spirals !== null && minFull !== null) return spirals >= minFull;
    const style = row.style;
    if (!style || style.presentationDone !== true) return null;
    return style.needsFound === true;
}

function priceOf(price: {
    amount: number;
    periodMonths: number | null;
    kind: string | null;
}): OwnerReportPrice {
    return {
        amount: price.amount,
        periodMonths: price.periodMonths,
        kind: price.kind,
        perMonth:
            price.periodMonths !== null && price.periodMonths > 0
                ? price.amount / price.periodMonths
                : null,
    };
}
