import type {
    AiRefreshScenario,
    AiRefreshStep,
    AiRefreshStepCode,
    AiRefreshStepOutcome,
} from '../refresh.types';

/** Что видит шаг: сценарий, сам шаг и момент тика. */
export interface AiRefreshStepContext {
    scenario: AiRefreshScenario;
    step: AiRefreshStep;
    now: Date;
}

/**
 * Шаг сценария: `start` запускает (или сразу делает) работу, `probe`
 * на следующих тиках смотрит, закончилась ли она. Оба не бросают наружу:
 * сбой — исход `error` с текстом.
 */
export interface AiRefreshStepHandler {
    readonly code: AiRefreshStepCode;
    start(context: AiRefreshStepContext): Promise<AiRefreshStepOutcome>;
    probe(context: AiRefreshStepContext): Promise<AiRefreshStepOutcome>;
}

/** Токен DI для набора шагов. */
export const AI_REFRESH_STEP_HANDLERS = Symbol('AI_REFRESH_STEP_HANDLERS');

/** Исход по ошибке: текст для админки, без стека. */
export const errorOutcome = (
    prefix: string,
    error: unknown,
): AiRefreshStepOutcome => ({
    state: 'error',
    text: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
});

/** Момент `iso` не раньше начала текущей фазы шага (запись свежая, не прошлая). */
export const sincePhaseStart = (step: AiRefreshStep, iso: string): boolean =>
    step.startedAt !== null && Date.parse(iso) >= Date.parse(step.startedAt);
