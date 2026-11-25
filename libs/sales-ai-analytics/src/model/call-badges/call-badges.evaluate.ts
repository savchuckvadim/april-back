/**
 * Бейджи звонка по lite-строке разбора: чистые функции без обращений к базе.
 *
 * Состояние бейджа — три значения: «да», «нет» и «неизвестно». «Неизвестно» —
 * разбор самого факта не несёт (старый разбор без поля, раздел неприменим к
 * типу звонка): такой звонок не попадает ни в «да», ни в «нет», чтобы
 * отсутствие данных не читалось как отсутствие проблемы.
 */
import type {
    AnalyticsCallLiteRow,
    AnalyticsLiteReportFacts,
} from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type {
    CallReportInterlocutorCode,
    CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    CALL_BADGE_IDS,
    CALL_BADGE_OUTCOMES,
    CALL_BADGE_PROGRESS_LOW_MAX,
    CALL_BADGE_WEAK_SECTION_MAX_SCORE,
    CALL_BADGE_WEAK_SECTIONS,
    type CallBadgeId,
    type CallBadgeOutcomeId,
    type CallBadgeWeakId,
} from './call-badges.catalog';
import { resolveLiteSignal } from '../manager-signal.lite';

export type CallBadgeState = 'yes' | 'no' | 'unknown';

/** Поля lite-строки, по которым считаются бейджи. */
export type CallBadgeRow = Pick<
    AnalyticsCallLiteRow,
    | 'analysisPresent'
    | 'nextStep'
    | 'objections'
    | 'sections'
    | 'riskFlags'
    | 'riskEvidence'
    | 'style'
    | 'methodology'
    | 'report'
>;

type BadgeRule = (row: CallBadgeRow) => CallBadgeState;

/** Роль собеседника «ЛПР» — единственная, при которой бейдж «говорил не с ЛПР» не нужен. */
const LPR_ROLE: CallReportInterlocutorCode = 'lpr';
const NEEDS_SECTION: CallReportSectionCode = 'NEEDS';

const yesNo = (condition: boolean): CallBadgeState =>
    condition ? 'yes' : 'no';

/** Признак из разбора: нет значения — «неизвестно», иначе «да», когда значение равно yesWhen. */
const flagState = (
    value: boolean | null | undefined,
    yesWhen: boolean,
): CallBadgeState =>
    value === null || value === undefined
        ? 'unknown'
        : yesNo(value === yesWhen);

/**
 * Несёт ли разбор факты отчётов (итог, самопредставление). Старые разборы
 * хранят пустой `report`, поэтому его пустота — не «нет», а «не знаем».
 */
const hasReportFacts = (report: AnalyticsLiteReportFacts | undefined) =>
    report !== undefined &&
    (report.outcome !== null || report.selfIntro !== null);

const sectionOf = (row: CallBadgeRow, code: CallReportSectionCode) =>
    row.sections.find(section => section.section === code);

const outcomeRule =
    (id: CallBadgeOutcomeId): BadgeRule =>
    row => {
        const outcome = row.report?.outcome ?? null;
        return outcome === null
            ? 'unknown'
            : yesNo(outcome === CALL_BADGE_OUTCOMES[id]);
    };

const weakRule =
    (id: CallBadgeWeakId): BadgeRule =>
    row => {
        const section = sectionOf(row, CALL_BADGE_WEAK_SECTIONS[id]);
        if (!section || section.relevance <= 0 || section.score === null) {
            return 'unknown';
        }
        return yesNo(section.score <= CALL_BADGE_WEAK_SECTION_MAX_SCORE);
    };

const stepMissing: BadgeRule = row =>
    row.nextStep === null ? 'unknown' : yesNo(!row.nextStep.set);

const stepNoDate: BadgeRule = row =>
    row.nextStep === null
        ? 'unknown'
        : yesNo(row.nextStep.set && !row.nextStep.date);

const progressLow: BadgeRule = row => {
    const progress = row.methodology?.dealProgress ?? null;
    return progress === null
        ? 'unknown'
        : yesNo(progress <= CALL_BADGE_PROGRESS_LOW_MAX);
};

const capped: BadgeRule = row =>
    row.methodology === undefined
        ? 'unknown'
        : yesNo(row.methodology.capsApplied > 0);

const priceNamed: BadgeRule = row => {
    const discussed = row.style?.priceDiscussed ?? null;
    if ((row.report?.prices.length ?? 0) > 0 || discussed === true) {
        return 'yes';
    }
    return !hasReportFacts(row.report) && discussed === null ? 'unknown' : 'no';
};

const notLpr: BadgeRule = row => {
    const role = row.style?.interlocutorRole ?? null;
    return role === null ? 'unknown' : yesNo(role !== LPR_ROLE);
};

const issue: BadgeRule = row =>
    hasReportFacts(row.report)
        ? yesNo((row.report?.issues.length ?? 0) > 0)
        : 'unknown';

const needsMissing: BadgeRule = row => {
    // Раздел «потребности» неприменим к типу звонка — судить о них не по чему.
    const needs = sectionOf(row, NEEDS_SECTION);
    if (needs && needs.relevance <= 0) return 'unknown';
    return flagState(row.style?.needsFound, false);
};

/** Правила бейджей: тип Record не даёт добавить бейдж справочника без правила. */
const BADGE_RULES: Record<CallBadgeId, BadgeRule> = {
    step_missing: stepMissing,
    step_no_date: stepNoDate,
    objection_unhandled: row =>
        yesNo(row.objections.some(objection => objection.handled === false)),
    signal: row => yesNo(resolveLiteSignal(row) !== null),
    outcome_advanced: outcomeRule('outcome_advanced'),
    outcome_callback: outcomeRule('outcome_callback'),
    outcome_postponed: outcomeRule('outcome_postponed'),
    outcome_refused: outcomeRule('outcome_refused'),
    outcome_no_contact: outcomeRule('outcome_no_contact'),
    progress_low: progressLow,
    capped,
    price_named: priceNamed,
    upsell_tried: row => flagState(row.report?.upsellAttempted, true),
    not_lpr: notLpr,
    no_self_intro: row => flagState(row.report?.selfIntro?.introduced, false),
    issue,
    needs_missing: needsMissing,
    weak_greeting: weakRule('weak_greeting'),
    weak_needs: weakRule('weak_needs'),
    weak_presentation: weakRule('weak_presentation'),
    weak_objections: weakRule('weak_objections'),
    weak_price: weakRule('weak_price'),
    weak_closing: weakRule('weak_closing'),
    weak_refusal: weakRule('weak_refusal'),
};

/** Состояние одного бейджа по разбору звонка. */
export function callBadgeState(
    id: CallBadgeId,
    row: CallBadgeRow,
): CallBadgeState {
    return row.analysisPresent ? BADGE_RULES[id](row) : 'unknown';
}

/** Бейджи звонка с ответом «да», в порядке справочника. */
export function callBadgesOf(row: CallBadgeRow): CallBadgeId[] {
    return CALL_BADGE_IDS.filter(id => callBadgeState(id, row) === 'yes');
}
