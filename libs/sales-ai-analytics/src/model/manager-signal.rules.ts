/**
 * Сигнал руководителю по одному звонку — одно правило для уведомления РОПу
 * в CRM (event-sales) и раздела «Аналитика» отчёта KPI (пульс, «Внимание»).
 *
 * Решение владельца 11.11.2026: повод — ОШИБКА МЕНЕДЖЕРА, а не возражение
 * клиента. В агрессивном b2b клиент возражает почти в каждом звонке
 * («дорого», «нам больше нравится конкурент») — это норма, не сигнал.
 * Сигнал дают, по порядку важности (один звонок — один сигнал):
 *  1. действующий риск-флаг с дословной цитатой из заданного набора
 *     (CRM — конфликт и нарушение регламента, витрина — ещё «дверь закрыта»);
 *  2. возражение, которое менеджер не отработал: не ответил по существу
 *     или клиент после его ответа ушёл из разговора;
 *  3. показ без выявленных потребностей;
 *  4. показ без «свойство → связка → выгода»: по методике — ни одного
 *     полного витка спирали; без методики — раздел «Презентация под
 *     потребности» на PRESENTATION_NO_SSV_MAX_SCORE из 10 и ниже.
 * Срочный приоритет коучинга сам по себе сигналом больше не является.
 *
 * Чистые функции над минимальной проекцией разбора: её собирают и DTO
 * разбора (event-sales), и lite-строка витрины (kpi-report-sales).
 */
import type {
    CallReportActiveRiskFlagCode,
    CallReportObjectionReaction,
    CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type { ObjectionOutcome } from './objections';
import { provenRiskFlags, type RiskEvidenceLike } from './risk-flags.util';
import { nonEmptyText } from './sections.util';

/** Ошибки менеджера, которые дают сигнал помимо риск-флагов. */
export const CALL_MISTAKE_SIGNAL_KINDS = [
    'objection_mishandled',
    'presentation_no_needs',
    'presentation_no_ssv',
] as const;
export type CallMistakeSignalKind = (typeof CALL_MISTAKE_SIGNAL_KINDS)[number];

/** Вид сигнала руководителю: доказанный риск-флаг или ошибка менеджера. */
export type ManagerSignalKind =
    | CallReportActiveRiskFlagCode
    | CallMistakeSignalKind;

/** Подписи ошибок менеджера (подписи флагов — справочник смарта). */
export const CALL_MISTAKE_SIGNAL_TITLES: Record<CallMistakeSignalKind, string> =
    {
        objection_mishandled: 'Возражение не отработано',
        presentation_no_needs: 'Презентация без выявленных потребностей',
        presentation_no_ssv: 'Презентация без «свойство — связка — выгода»',
    };

/** Без методики: оценка раздела «Презентация под потребности» не выше — показ без С-С-В. */
export const PRESENTATION_NO_SSV_MAX_SCORE = 3;

const REACTION_OFF_POINT: CallReportObjectionReaction = 'other';
const OUTCOME_CLIENT_LEFT: ObjectionOutcome = 'disengaged';
const NEEDS_SECTION: CallReportSectionCode = 'NEEDS';
const PRESENTATION_SECTION: CallReportSectionCode = 'PRESENTATION';

export const isCallMistakeSignalKind = (
    kind: string,
): kind is CallMistakeSignalKind =>
    (CALL_MISTAKE_SIGNAL_KINDS as readonly string[]).includes(kind);

/** Возражение в объёме правила: цитата клиента, отработано ли, исход, реакция. */
export interface ManagerSignalObjection {
    quote: string | null;
    handled: boolean | null;
    /** continued / converted / disengaged; null — нет. */
    outcome: string | null;
    /** answer / clarify / other; null или нет поля — старый разбор. */
    reaction?: string | null;
}

/** Раздел разговора в объёме правила. */
export interface ManagerSignalSection {
    section: string;
    relevance: number;
    score: number | null;
    asWas: string | null;
}

/** Проекция разбора звонка, по которой решается сигнал. */
export interface ManagerSignalCallView {
    riskFlags: readonly string[];
    riskEvidence?: readonly RiskEvidenceLike[] | null;
    objections: readonly ManagerSignalObjection[];
    sections: readonly ManagerSignalSection[];
    /** Был ли показ (строгое определение разбора); null — неизвестно. */
    presentationDone: boolean | null;
    needsFound: boolean | null;
    /** Полных витков спирали по методике; null — методика их не считала. */
    spiralsFull: number | null;
}

/** Чья цитата: доказательство флага, слова клиента или «как было» менеджера. */
export type ManagerSignalQuoteSource = 'evidence' | 'client' | 'manager';

export interface ManagerSignal {
    kind: ManagerSignalKind;
    /** Дословная цитата; null — в разборе её нет. */
    quote: string | null;
    quoteSource: ManagerSignalQuoteSource;
    /** Что пошло не так одной фразой; null — ясно из вида сигнала. */
    detail: string | null;
}

/** Сигнал по звонку или null — повода для руководителя нет. */
export function resolveManagerSignal(
    view: ManagerSignalCallView,
    flags: readonly CallReportActiveRiskFlagCode[],
): ManagerSignal | null {
    return (
        flagSignal(view, flags) ??
        objectionSignal(view.objections) ??
        presentationSignal(view)
    );
}

function flagSignal(
    view: ManagerSignalCallView,
    flags: readonly CallReportActiveRiskFlagCode[],
): ManagerSignal | null {
    const proven = provenRiskFlags(view.riskFlags, view.riskEvidence).find(
        item => flags.includes(item.flag),
    );
    return proven
        ? {
              kind: proven.flag,
              quote: proven.quote,
              quoteSource: 'evidence',
              detail: null,
          }
        : null;
}

/** Первое возражение, где менеджер не ответил по существу или клиент ушёл. */
function objectionSignal(
    objections: readonly ManagerSignalObjection[],
): ManagerSignal | null {
    const missed = objections.find(
        objection =>
            objection.handled === false &&
            (objection.reaction === REACTION_OFF_POINT ||
                objection.outcome === OUTCOME_CLIENT_LEFT),
    );
    if (!missed) return null;
    const detail = [
        missed.reaction === REACTION_OFF_POINT
            ? 'менеджер не ответил по существу'
            : null,
        missed.outcome === OUTCOME_CLIENT_LEFT
            ? 'клиент после этого ушёл из разговора'
            : null,
    ]
        .filter((part): part is string => part !== null)
        .join(', ');
    return {
        kind: 'objection_mishandled',
        quote: nonEmptyText(missed.quote),
        quoteSource: 'client',
        detail,
    };
}

function presentationSignal(view: ManagerSignalCallView): ManagerSignal | null {
    if (view.presentationDone !== true) return null;
    if (view.needsFound === false) {
        return {
            kind: 'presentation_no_needs',
            quote:
                asWasOf(view, NEEDS_SECTION) ??
                asWasOf(view, PRESENTATION_SECTION),
            quoteSource: 'manager',
            detail: null,
        };
    }
    const detail = missingSsvDetail(view);
    return detail
        ? {
              kind: 'presentation_no_ssv',
              quote: asWasOf(view, PRESENTATION_SECTION),
              quoteSource: 'manager',
              detail,
          }
        : null;
}

/** Почему показ без С-С-В; null — С-С-В был или судить не по чему. */
function missingSsvDetail(view: ManagerSignalCallView): string | null {
    if (view.spiralsFull !== null) {
        return view.spiralsFull === 0
            ? 'ни одного полного витка «потребность → свойство → связка → выгода → вопрос»'
            : null;
    }
    const score =
        view.sections.find(
            item =>
                item.section === PRESENTATION_SECTION &&
                item.relevance > 0 &&
                item.score !== null,
        )?.score ?? null;
    return score !== null && score <= PRESENTATION_NO_SSV_MAX_SCORE
        ? `«Презентация под потребности» — ${score} из 10`
        : null;
}

function asWasOf(
    view: ManagerSignalCallView,
    code: CallReportSectionCode,
): string | null {
    const section = view.sections.find(
        item => item.section === code && item.relevance > 0,
    );
    return nonEmptyText(section?.asWas)?.trim() ?? null;
}
