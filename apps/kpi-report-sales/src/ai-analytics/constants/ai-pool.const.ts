/**
 * Константы шага «пул порталов» (план `ai-sales-analytics` §4.4 «Пул»,
 * §4.7 SI_0, §4.10 E2, §4.11; Фаза 4, П17/П22): код и ритмы шага `pool`
 * и причины пропуска.
 *
 * Пул — месячный шаг, а не квартальный ритм (решение волны B: агрегат
 * дешёвый, новый ритм расползся бы на шесть файлов и админ-спеку).
 *
 * Свой файл констант среза — правило владения общими файлами §1.6 п. 3.
 */
import type { AiPipelineRhythm } from './ai-snapshot.const';

/** Код шага конвейера (уникален в массиве шагов). */
export const AI_POOL_STEP_CODE = 'pool' as const;

/**
 * Ритмы пула: заморозка месяца и догон истории, после `quality-link`
 * (β портала уже записана) и до `portal-model` (она читает шину `pool`).
 */
export const AI_POOL_STEP_RHYTHMS = [
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/**
 * Причины пропуска шага пула. `not-in-pool` — у портала нет датированного
 * согласия: он ничего не получает и ничего не пишет (режим владельца А.3).
 */
export const AI_POOL_STEP_REASONS = {
    notInPool: 'not-in-pool',
    badDay: 'pool-bad-day',
} as const;
export type AiPoolStepReason =
    (typeof AI_POOL_STEP_REASONS)[keyof typeof AI_POOL_STEP_REASONS];
