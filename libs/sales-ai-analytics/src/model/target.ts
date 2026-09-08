/**
 * Цель месяца `G` и её санити-проверки (план `ai-sales-analytics`, §4.9;
 * Фаза 2, поток `p2-model-forecast-plan`).
 *
 * Каскад: план руководителя (`UF_USR_A_SALES_PLAN_sales_count`, снапшот
 * первого числа) → `target_override` → `target_sales_by_level` → медиана
 * полосы стажа за 3 месяца. Каскад — именно каскад запасных вариантов:
 * если план руководителя есть, он и берётся, а `target_override` подменяет
 * цель уровня, когда плана нет.
 *
 * Санити: цель ниже медианы факта полосы — «план = пожелание» (он не
 * управляет поведением), цель выше `cap × D` — «недостижимо объёмом».
 *
 * Чистая математика: без DI, Bitrix и Prisma, без `Date.now`/`Math.random`.
 */

/** Источник цели в DTO плана дня. */
export const AI_TARGET_SOURCES = ['plan', 'levelTarget', 'median'] as const;

/** Откуда взята цель `G`. */
export type TargetSource = (typeof AI_TARGET_SOURCES)[number];

/** Флаги санити цели. */
export const AI_TARGET_FLAGS = ['wish', 'unreachable-by-volume'] as const;

/** Признак нездоровой цели: пожелание либо недостижимость объёмом. */
export type TargetFlag = (typeof AI_TARGET_FLAGS)[number];

/** Ступени каскада цели; null/undefined — ступень пуста. */
export interface TargetCascade {
    /** План руководителя из снапшота первого числа. */
    readonly planHead?: number | null;
    /** `target_override` — ручная цель менеджера. */
    readonly override?: number | null;
    /** `target_sales_by_level` — цель уровня. */
    readonly levelTarget?: number | null;
    /** Медиана факта полосы стажа за 3 месяца. */
    readonly bandMedian?: number | null;
}

/** Разрешённая цель месяца. */
export interface ResolvedTarget {
    readonly value: number;
    readonly source: TargetSource;
    /**
     * Цель взята из `target_override`. Отдельным полем, а не значением
     * `source`: union источника уже отдан фронту в DTO плана дня.
     */
    readonly fromOverride: boolean;
    /** Ни одна ступень каскада не заполнена — цель равна нулю. */
    readonly empty: boolean;
}

/** Вход санити-проверки цели. */
export interface TargetSanityInput {
    readonly target: number;
    /** Медиана факта продаж полосы стажа; null — не оценена. */
    readonly bandFactMedian?: number | null;
    /** `cap` — потолок дневного темпа продаж полосы; null — не оценён. */
    readonly cap?: number | null;
    /** `D` — рабочих дней месяца. */
    readonly workdays: number;
}

/** Итог санити-проверки цели. */
export interface TargetSanity {
    readonly flags: TargetFlag[];
    /** `cap × D` — максимум продаж по объёму; null — потолка нет. */
    readonly maxByCapacity: number | null;
}

const isFilled = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;

const finite = (value: number | undefined, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Цель `G` по каскаду. Пустой каскад даёт ноль с `empty: true` — вызывающий
 * код обязан показать «цель не задана», а не считать план от нуля молча.
 */
export function resolveTarget(cascade: TargetCascade): ResolvedTarget {
    if (isFilled(cascade.planHead)) {
        return {
            value: cascade.planHead,
            source: 'plan',
            fromOverride: false,
            empty: false,
        };
    }
    if (isFilled(cascade.override)) {
        return {
            value: cascade.override,
            source: 'plan',
            fromOverride: true,
            empty: false,
        };
    }
    if (isFilled(cascade.levelTarget)) {
        return {
            value: cascade.levelTarget,
            source: 'levelTarget',
            fromOverride: false,
            empty: false,
        };
    }
    if (isFilled(cascade.bandMedian)) {
        return {
            value: cascade.bandMedian,
            source: 'median',
            fromOverride: false,
            empty: false,
        };
    }

    return { value: 0, source: 'median', fromOverride: false, empty: true };
}

/**
 * Санити цели: «пожелание» (ниже медианы факта полосы — цель ничего не
 * требует) и «недостижимо объёмом» (выше `cap × D`). Оба флага могут
 * стоять одновременно только при нездоровых данных полосы.
 */
export function targetSanity(input: TargetSanityInput): TargetSanity {
    const target = Math.max(0, finite(input.target));
    const workdays = Math.max(0, finite(input.workdays));
    const flags: TargetFlag[] = [];
    if (isFilled(input.bandFactMedian) && target < input.bandFactMedian) {
        flags.push('wish');
    }
    const maxByCapacity = isFilled(input.cap) ? input.cap * workdays : null;
    if (maxByCapacity !== null && target > maxByCapacity) {
        flags.push('unreachable-by-volume');
    }

    return { flags, maxByCapacity };
}
