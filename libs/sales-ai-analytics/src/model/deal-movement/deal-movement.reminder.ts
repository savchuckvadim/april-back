/**
 * Напоминания «Давно без продвижения» (решение владельца 20.11.2026):
 * сделка так и стоит в стадии — напоминание, когда дни в стадии превысили
 * срок вдвое, втрое, вчетверо… Каждая ступень напоминается один раз
 * (ступень — в состоянии сделки, `remindedStep`). Напоминания идут только в
 * сводку раз в неделю / две недели, в ежедневную и в ленту — нет. Чистые
 * функции.
 */
import type {
    DealMovementFacts,
    DealMovementStatus,
} from './deal-movement.types';

/** С какой ступени напоминаем: «вдвое дольше срока». */
export const DEAL_MOVEMENT_REMINDER_MIN_STEP = 2;

/** Статусы «стоит в стадии дольше срока». */
export const DEAL_MOVEMENT_REMINDER_STATUSES = [
    'abandoned',
    'stuck',
] as const satisfies readonly DealMovementStatus[];

/**
 * Ступень просрочки: наибольшее k, при котором дней в стадии БОЛЬШЕ k
 * сроков (63 дня при сроке 21 — 2, 64 — 3). Срока нет — 0.
 */
export function dealMovementOverdueStep(
    facts: Pick<DealMovementFacts, 'daysInStage' | 'stageLimitDays'>,
): number {
    if (facts.stageLimitDays <= 0 || facts.daysInStage <= 0) return 0;
    return Math.max(0, Math.ceil(facts.daysInStage / facts.stageLimitDays) - 1);
}

/**
 * Ступень, о которой пора напомнить; null — не пора. Прошлая ступень выше
 * нынешней (сделка вошла в стадию заново, срок вырос) — считается, что не
 * напоминали.
 */
export function dueDealMovementReminder(
    status: DealMovementStatus,
    facts: Pick<DealMovementFacts, 'daysInStage' | 'stageLimitDays'>,
    remindedStep: number,
): number | null {
    if (
        !(DEAL_MOVEMENT_REMINDER_STATUSES as readonly string[]).includes(status)
    ) {
        return null;
    }
    const step = dealMovementOverdueStep(facts);
    if (step < DEAL_MOVEMENT_REMINDER_MIN_STEP) return null;
    const reminded = remindedStep > step ? 0 : remindedStep;
    return step > reminded ? step : null;
}
