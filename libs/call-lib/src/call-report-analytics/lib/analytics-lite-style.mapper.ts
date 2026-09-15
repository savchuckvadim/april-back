import { asBoolean, asNumber, asString } from './json-value.util';
import type { AnalyticsLiteStyle } from '../types/analytics-lite.types';

/**
 * Проекция маркеров стиля из `user_result` глубокого разбора в лёгкую
 * строку (документ `ai/tasks/ai-analytics-manager-style.md`, §7.2 п. 2).
 *
 * Новых полей у разбора не появляется: берутся те, что схема
 * `CALL_DEEP_ANALYSIS_SCHEMA` (и фокусы `FOCUS_FORM/CONTENT/MOVEMENT`) уже
 * отдают, но лёгкая выборка их не несла. Массивы превращаются в счётчики —
 * оси стиля считаются по числам, а тексты потребностей и конкурентов в
 * витрину стиля не идут.
 */
export function mapLiteStyle(
    analysis: Record<string, unknown> | null,
): AnalyticsLiteStyle {
    if (!analysis) return emptyStyle();
    return {
        talkRatioPct: asNumber(analysis.talkRatioPct),
        questionsCount: asNumber(analysis.questionsCount),
        needsFound: asBoolean(analysis.needsFound),
        needsCount: countOf(analysis.needs),
        presentationDone: asBoolean(analysis.presentationDone),
        productsOfferedCount: countOf(analysis.productsOffered),
        priceDiscussed: asBoolean(analysis.priceDiscussed),
        competitorsCount: countOf(analysis.competitors),
        refusalCategory: asString(analysis.refusalCategory),
        interlocutorRole: asString(analysis.interlocutorRole),
        productive: asBoolean(analysis.productive),
        scriptCompliance: asNumber(analysis.scriptCompliance),
        callDirection: asString(analysis.callDirection),
    };
}

/** Разбора нет — все маркеры null (каждой строке свой экземпляр). */
export function emptyStyle(): AnalyticsLiteStyle {
    return {
        talkRatioPct: null,
        questionsCount: null,
        needsFound: null,
        needsCount: null,
        presentationDone: null,
        productsOfferedCount: null,
        priceDiscussed: null,
        competitorsCount: null,
        refusalCategory: null,
        interlocutorRole: null,
        productive: null,
        scriptCompliance: null,
        callDirection: null,
    };
}

/** Длина массива; не массив → null (отличие «нет поля» от «пустой список»). */
function countOf(value: unknown): number | null {
    return Array.isArray(value) ? value.length : null;
}
