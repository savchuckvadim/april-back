import type { CallAnalysisPart } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    FOCUS_KEYS,
    FOCUS_SECTION_CODES,
    type CallFocusKey,
} from '../contracts/call-focus-analysis.contract';
import type { FocusPassResult } from './call-focus-stored.util';

/**
 * Сборка фокус-разбора из ответов проходов — чистые функции (16.11.2026,
 * вынесено из CallFocusAnalysisService). Одна сборка и у штатного разбора,
 * и у догона, который берёт часть проходов из сохранённых: разбор получается
 * одинаковым, откуда бы ни пришёл ответ прохода. Ключи проходов — общий
 * список FOCUS_KEYS из контракта.
 */

/** Ответы фокус-проходов по ключам; null — проход не собрался. */
export type FocusResultsByKey = Record<CallFocusKey, FocusPassResult | null>;

/** Пустая заготовка: ни один проход ещё не ответил. */
export function emptyFocusResults(): FocusResultsByKey {
    return {
        form: null,
        content: null,
        movement: null,
        closing: null,
    };
}

/**
 * Чего не хватает в разборе: сорвавшиеся проходы, синтез и проход методики
 * (если у портала методика есть, а ответа прохода нет). По этому списку
 * догон находит неполный разбор.
 */
export function focusIncompleteParts(
    byKey: Readonly<FocusResultsByKey>,
    synthesis: FocusPassResult | null,
    methodologyExpected: boolean,
    methodology: FocusPassResult | null,
): CallAnalysisPart[] {
    return [
        ...FOCUS_KEYS.filter(key => !byKey[key]),
        ...(synthesis ? [] : (['synthesis'] as const)),
        ...(methodologyExpected && !methodology
            ? (['methodology'] as const)
            : []),
    ];
}

/** Разделы прохода: свои (коды его зоны) и чужие коды, которые отброшены. */
export interface OwnSections {
    own: Record<string, unknown>[];
    /** Коды разделов чужой зоны — модель нарушила перечень схемы. */
    foreign: string[];
}

/**
 * Разделы прохода — только коды его зоны: чужой код задвоил бы раздел
 * другого прохода.
 */
export function ownSectionsOf(
    result: FocusPassResult | null,
    key: CallFocusKey,
): OwnSections {
    const raw = Array.isArray(result?.sections)
        ? (result.sections as Record<string, unknown>[])
        : [];
    const allowed = FOCUS_SECTION_CODES[key];
    const codeOf = (section: Record<string, unknown>): string =>
        typeof section.section === 'string' ? section.section : '';
    return {
        own: raw.filter(section => allowed.includes(codeOf(section))),
        foreign: raw
            .filter(section => !allowed.includes(codeOf(section)))
            .map(codeOf),
    };
}

/**
 * Плоский объект разбора из ответов проходов и синтеза: поля проходов не
 * пересекаются, синтез кладёт итоговые поверх, разделы — только свои у
 * каждого прохода.
 */
export function mergeFocusResults(input: {
    byKey: Readonly<FocusResultsByKey>;
    synthesis: FocusPassResult | null;
    sections: Record<string, unknown>[];
    callType: string;
    incompleteParts: CallAnalysisPart[];
    usage: unknown;
}): Record<string, unknown> {
    const passFields = FOCUS_KEYS.reduce<Record<string, unknown>>(
        (fields, key) => ({ ...fields, ...(input.byKey[key] ?? {}) }),
        {},
    );
    return {
        ...passFields,
        ...(input.synthesis ?? {}),
        sections: input.sections,
        callType: input.callType,
        incompleteParts: input.incompleteParts,
        usage: input.usage,
    };
}
