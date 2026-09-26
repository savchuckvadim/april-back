/**
 * Уровень и стаж менеджера в строке обзора (план 2.2, §4.6). Вынесено из
 * `ai-overview.const.ts` по лимиту 300 строк; тот файл реэкспортирует
 * всё отсюда, прежние импорты не меняются. Runtime-массивы union-литералов
 * переиспользуются в Swagger enum (ai/rules/dto-conventions.md).
 */
import { AI_PASSPORT_SINCE_SOURCES } from '@lib/sales-ai-analytics';

/** Уровни менеджера (план 2.2); назначает РОП, дефолт — по стажу. */
export const AI_ANALYTICS_MANAGER_LEVELS = [
    'junior',
    'middle',
    'senior',
] as const;
export type AiAnalyticsManagerLevel =
    (typeof AI_ANALYTICS_MANAGER_LEVELS)[number];

/**
 * Источник уровня строки: manual — назначен РОПом (ai_analytics_levels);
 * passport — подсказка паспорта менеджера из месячного снапшота (полоса
 * стажа, тот же источник, что у ночного конвейера); default — ни записи,
 * ни паспорта: дефолт по стажу.
 */
export const AI_ANALYTICS_LEVEL_SOURCES = [
    'manual',
    'default',
    'passport',
] as const;
export type AiAnalyticsLevelSource =
    (typeof AI_ANALYTICS_LEVEL_SOURCES)[number];

/**
 * Источник даты начала стажа строки: manual — since записи уровня РОПа;
 * иначе каскад паспорта (employment — UF_EMPLOYMENT_DATE, register —
 * DATE_REGISTER, proxy — первое событие телефонии/отчётности). Значения
 * паспорта — из библиотеки, список не дублируется.
 */
export const AI_ANALYTICS_SINCE_SOURCES = [
    'manual',
    ...AI_PASSPORT_SINCE_SOURCES,
] as const;
export type AiAnalyticsSinceSource =
    (typeof AI_ANALYTICS_SINCE_SOURCES)[number];

/** Стаж короче — junior по умолчанию; без даты стажа — middle. */
export const AI_ANALYTICS_JUNIOR_TENURE_MONTHS = 6;
export const AI_ANALYTICS_DEFAULT_LEVEL: AiAnalyticsManagerLevel = 'middle';
