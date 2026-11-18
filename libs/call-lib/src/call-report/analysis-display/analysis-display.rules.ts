/**
 * Правила показа разбора звонка (решения владельца 18.11.2026) — одни и те
 * же для записи разбора (приём, переразбор, догон, перезапись карточки) и
 * для всех мест, где разбор видит человек: страница звонка, недельный
 * Excel, средние по отделу, стиль менеджера. Чистые функции над
 * произвольным JSON разбора (`ais.user_result`): поле не того типа —
 * значения нет.
 */
import { asNumber } from '../../call-report-analytics/lib/json-value.util';

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
