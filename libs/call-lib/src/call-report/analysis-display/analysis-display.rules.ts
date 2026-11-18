/**
 * Правила показа разбора звонка (решения владельца 18.11.2026) — одни и те
 * же для записи разбора (приём, переразбор, догон, перезапись карточки) и
 * для всех мест, где разбор видит человек: страница звонка, недельный
 * Excel, средние по отделу, стиль менеджера. Чистые функции над
 * произвольным JSON разбора (`ais.user_result`): поле не того типа —
 * значения нет.
 */
import type { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { asNumber } from '../../call-report-analytics/lib/json-value.util';

/**
 * Типы звонков, у которых есть чек-листы «Хвост» и 5К: только презентация
 * (решение владельца 18.11.2026: «нужны только если тип звонка
 * презентация»). Звонок по решению и доработка чек-листов не получают —
 * осознанно, по тому же решению.
 */
export const CALL_REPORT_CHECKLIST_CALL_TYPES = [
    'presentation',
] as const satisfies readonly CallReportCallTypeCode[];

/** Поля чек-листов «Хвост» и 5К в разборе. */
export const CALL_ANALYSIS_CHECKLIST_FIELDS = [
    'hvostDone',
    'hvostAnalysis',
    'hvostSteps',
    'fiveKDone',
    'fiveKAnalysis',
    'fiveKItems',
] as const;

export type CallAnalysisChecklistField =
    (typeof CALL_ANALYSIS_CHECKLIST_FIELDS)[number];

/**
 * Есть ли у звонка этого типа чек-листы «Хвост» и 5К. Тип — итоговый тип
 * разбора (`callType`: после уточнения синтезом в конвейере); его же
 * показывают страница звонка и отчёты.
 */
export function callTypeHasChecklists(callType: unknown): boolean {
    return (
        typeof callType === 'string' &&
        (CALL_REPORT_CHECKLIST_CALL_TYPES as readonly string[]).includes(
            callType,
        )
    );
}

/** Поле разбора: в разбор попал документ вида «Скрипт разговора». */
export const SCRIPT_INCLUDED_KEY = 'scriptIncluded';

/** Разбор, у которого читается признак скрипта. */
export type ScriptIncludedSource = Readonly<{ scriptIncluded?: unknown }>;

/** Разбор, у которого читается процент соответствия скрипту. */
export type ScriptComplianceSource = ScriptIncludedSource &
    Readonly<{ scriptCompliance?: unknown }>;

/**
 * Можно ли верить проценту «Соответствие скрипту»: только если в разбор
 * попал хотя бы один документ вида «Скрипт разговора». Признак ставит код
 * по сборке материалов, а не модель. У разборов до 18.11.2026 признака нет
 * — процент не показывается (скриптов тогда не было ни у одного портала).
 */
export function isScriptComplianceTrusted(
    analysis: ScriptIncludedSource | null | undefined,
): boolean {
    return analysis?.[SCRIPT_INCLUDED_KEY] === true;
}

/**
 * Процент соответствия скрипту для показа и средних: число — только при
 * скрипте в разборе, иначе null.
 */
export function trustedScriptCompliance(
    analysis: ScriptComplianceSource | null | undefined,
): number | null {
    if (!isScriptComplianceTrusted(analysis)) return null;
    return asNumber(analysis?.scriptCompliance);
}
