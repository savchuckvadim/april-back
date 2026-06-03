export interface RateLimitPlanConfig {
    /** Ёмкость ведра — максимальный счётчик до блокировки (X) */
    capacity: number;
    /** Скорость дренажа в секунду (Y) */
    ratePerSec: number;
}

export const RATE_LIMIT_PLAN_CONFIGS = {
    regular: { capacity: 50, ratePerSec: 2 },
    enterprise: { capacity: 250, ratePerSec: 5 },
} as const satisfies Record<string, RateLimitPlanConfig>;

export type BitrixPlanKey = keyof typeof RATE_LIMIT_PLAN_CONFIGS;
