import { CALL_REPORT_OUTCOME_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-report-facts.type';
import { isBelowMinDuration, minDurationMapOf } from '../manager-type-matrix';
import type { MinDurationSecByType } from '../pulse-duration';
import { isoWeekday, shiftDate, toPortalDate } from '../workdays.util';
import type {
    OwnerReportCall,
    OwnerReportCallInput,
    OwnerReportOutcome,
    OwnerReportOutcomeSource,
    OwnerReportPrice,
    OwnerReportTypeGroup,
} from './owner-report.types';

/**
 * Нормализация lite-строк звонков в единицу счётчиков отчёта собственнику.
 * Старый разбор без фактов focus-v3.1 не выбрасывается: исход выводится по
 * прежним полям (`outcomeSource = 'derived'`), и отчёт честно показывает
 * долю выведенных исходов, а не «мало данных».
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

/** Исход, который двигает сделку, если вид шага известен. */
const ADVANCING_STEP_KINDS: ReadonlySet<string> = new Set([
    'presentation',
    'demo_access',
    'offer',
    'invoice',
]);

/** Роль собеседника, при которой контакт с решающим не состоялся. */
const NO_CONTACT_ROLES: ReadonlySet<string> = new Set(['secretary', 'other']);

/** Продвижение сделки по звонку (1–5), с которого разговор считаем продвинутым. */
const DERIVED_ADVANCED_PROGRESS = 3;

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
    const { outcome, source } = outcomeOf(row);
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
        outcome,
        outcomeSource: source,
        contactReached: outcome !== 'no_contact',
        advanced: outcome === 'advanced',
        nextStepSet,
        nextStepDated: nextStepSet && typeof row.nextStep?.date === 'string',
        nextStepKind,
        objections: row.objections.map(objection => ({
            topic: objection.topic ?? 'other',
            handled: objection.handled,
            outcome: objection.outcome,
        })),
        issues: (row.report?.issues ?? []).map(issue => issue.code),
        prices: (row.report?.prices ?? []).map(priceOf),
        upsellAttempted: row.report?.upsellAttempted ?? null,
        needsFound: style?.needsFound ?? null,
        presentationByNeeds: presentationByNeedsOf(row),
        closingAttempted:
            closing && closing.score !== null
                ? closing.score >= CLOSING_ATTEMPT_MIN_SCORE
                : null,
        conflict: row.riskFlags.includes('conflict'),
        evasive: row.report?.selfIntro?.offerQuestion === 'evasive',
        score: row.score,
    };
}

export function typeGroupOf(
    row: Pick<OwnerReportCallInput, 'callType' | 'reactivation'>,
): OwnerReportTypeGroup {
    if (row.reactivation === true) return 'reactivation';
    if (!row.callType) return 'other';
    return TYPE_GROUP_BY_CALL_TYPE[row.callType] ?? 'other';
}

/**
 * Исход разговора: из разбора focus-v3.1, иначе по старым полям —
 * отказ → refused; шаг с датой и видом, двигающим сделку, или продвижение
 * ≥ 3 → advanced; шаг с датой → callback_dated; шаг без даты → postponed;
 * собеседник не ЛПР и не пользователь → no_contact; иначе postponed.
 */
export function outcomeOf(row: OwnerReportCallInput): {
    outcome: OwnerReportOutcome;
    source: OwnerReportOutcomeSource;
} {
    const fromAnalysis = row.report?.outcome ?? null;
    if (fromAnalysis !== null && OUTCOME_CODES.has(fromAnalysis)) {
        return {
            outcome: fromAnalysis as OwnerReportOutcome,
            source: 'analysis',
        };
    }
    return { outcome: deriveOutcome(row), source: 'derived' };
}

function deriveOutcome(row: OwnerReportCallInput): OwnerReportOutcome {
    if (row.style?.refusalCategory) return 'refused';
    const step = row.nextStep;
    const dated = step?.set === true && typeof step.date === 'string';
    const progress = row.methodology?.dealProgress ?? null;
    const advancingKind =
        step?.kind !== null &&
        step?.kind !== undefined &&
        ADVANCING_STEP_KINDS.has(step.kind);
    if (
        (dated && advancingKind) ||
        (progress !== null && progress >= DERIVED_ADVANCED_PROGRESS)
    ) {
        return 'advanced';
    }
    if (dated) return 'callback_dated';
    if (step?.set === true) return 'postponed';
    const role = row.style?.interlocutorRole ?? null;
    if (role !== null && NO_CONTACT_ROLES.has(role)) return 'no_contact';
    return 'postponed';
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
