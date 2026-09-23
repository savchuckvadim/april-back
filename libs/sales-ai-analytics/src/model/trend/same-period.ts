/**
 * Пара «тот же период год назад» (план Фазы 3, поток П3 `p3-yoy`): по
 * ключу месяца витрины выбирается ключ M−12 и решается, сопоставимы ли
 * периоды между собой.
 *
 * Сравнение только описательное: функции отвечают «можно ли ставить эти
 * два числа рядом», а не «хорошо это или плохо». Решение владельца В9 от
 * 22.09.2026: если менеджер год назад был в другом отделе или на другом
 * уровне — сравниваем **с ним же**, но `comparable: false` с причиной;
 * подменять его другим человеком или прятать пару нельзя.
 *
 * Несопоставимость не запрещает показ: витрина показывает оба периода и
 * причины рядом. Запрещает показ только `available: false` — истории
 * M−12 нет вовсе, и тогда наружу не уходит ни одного числа.
 *
 * Чистые функции: без DI, Bitrix и `new Date()` внутри — и текущий ключ
 * периода, и оба состава приходят параметрами.
 */

/** Ключ месяца 'YYYY-MM' — единственное зерно сравнения год назад. */
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Сколько месяцев назад лежит сравниваемый период. */
export const SAME_PERIOD_LAG_MONTHS = 12;

/**
 * Причины, по которым пара периодов несопоставима. Код — материал
 * витрины и «Как считаем»: текст причины живёт в приложении, здесь
 * только реестр кодов.
 */
export const SAME_PERIOD_REASONS = {
    /** Зерно периода не месяц (неделя, произвольный отрезок). */
    periodNotMonth: 'period-not-month',
    /** Снапшота M−12 нет: истории меньше 13 месяцев либо месяц пропущен. */
    noHistory: 'no-history',
    /** Версии разбора между периодами разошлись (рубрика, промпт, реестр). */
    versionsChanged: 'versions-changed',
    /** Граница сравнимой истории позже начала периода год назад. */
    beforeComparable: 'before-comparable',
    /** Год назад менеджер работал в другом отделе продаж (В9). */
    departmentChanged: 'department-changed',
    /** Год назад у менеджера был другой уровень (В9). */
    levelChanged: 'level-changed',
    /** Год назад менеджер был в другой полосе стажа. */
    tenureBandChanged: 'tenure-band-changed',
    /** Между периодами в журнале портала есть событие-излом. */
    portalEvent: 'portal-event',
} as const;
export type SamePeriodReason =
    (typeof SAME_PERIOD_REASONS)[keyof typeof SAME_PERIOD_REASONS];

/** Порядок причин в выдаче: сначала данные, потом состав, потом журнал. */
const REASON_ORDER: readonly SamePeriodReason[] = [
    SAME_PERIOD_REASONS.periodNotMonth,
    SAME_PERIOD_REASONS.noHistory,
    SAME_PERIOD_REASONS.versionsChanged,
    SAME_PERIOD_REASONS.beforeComparable,
    SAME_PERIOD_REASONS.departmentChanged,
    SAME_PERIOD_REASONS.levelChanged,
    SAME_PERIOD_REASONS.tenureBandChanged,
    SAME_PERIOD_REASONS.portalEvent,
];

/** Состав менеджера на один из двух периодов (всё необязательно). */
export interface SamePeriodComposition {
    /** Id отдела продаж; null — вне ростера, неизвестно. */
    readonly departmentId?: number | null;
    /** Уровень менеджера кодом приложения; null — неизвестен. */
    readonly level?: string | null;
    /** Полоса стажа кодом `tenure-bands.ts`; null — стаж неизвестен. */
    readonly tenureBand?: string | null;
    /** Сигнатура версий разбора периода; null — неизвестна. */
    readonly versions?: string | null;
}

/** Вход выбора пары периодов. */
export interface SamePeriodInput {
    /** Ключ периода витрины: сопоставление идёт только по месяцу. */
    readonly periodKey: string;
    /** Зерно периода витрины; не 'month' — пары нет. */
    readonly grain?: 'month' | 'week' | 'range';
    /** Есть ли снапшот M−12 (менеджера либо портала). */
    readonly basePresent: boolean;
    /** Состав на текущий период. */
    readonly current?: SamePeriodComposition;
    /** Состав на период год назад. */
    readonly base?: SamePeriodComposition;
    /**
     * Граница сравнимой истории 'YYYY-MM-DD' (`comparableFrom`); пусто —
     * ряд не рвался.
     */
    readonly comparableFrom?: string | null;
    /**
     * Даты событий портала 'YYYY-MM-DD' между периодами (журнал
     * `ai_analytics_events`, `detectPortalEvents`); пусто — изломов нет.
     */
    readonly portalEvents?: readonly string[];
}

/** Итог выбора пары периодов. */
export interface SamePeriodPair {
    /** Ключ текущего месяца 'YYYY-MM'; null — зерно не месяц. */
    readonly periodKey: string | null;
    /** Ключ месяца год назад 'YYYY-MM'; null — пары нет. */
    readonly basePeriodKey: string | null;
    /** Пара существует и данные за оба периода есть. */
    readonly available: boolean;
    /** Числа периодов можно ставить рядом без оговорок. */
    readonly comparable: boolean;
    /** Причины несопоставимости в фиксированном порядке, без повторов. */
    readonly reasons: SamePeriodReason[];
}

/** Ключ месяца ли это. */
export function isMonthKey(value: unknown): value is string {
    return typeof value === 'string' && MONTH_KEY_RE.test(value);
}

/**
 * Ключ месяца, сдвинутый на `lag` месяцев назад. Работает на границе
 * года (`'2026-01' → '2025-01'`) и не зависит от длины месяца: февраль
 * високосного года сравнивается с февралём обычного по ключу, а не по
 * числу дней. Не-месяц → null.
 */
export function shiftMonthKey(
    monthKey: string,
    lag: number = SAME_PERIOD_LAG_MONTHS,
): string | null {
    if (!isMonthKey(monthKey) || !Number.isInteger(lag)) return null;
    const [year, month] = monthKey.split('-').map(Number);
    // Месяцы от «нулевого года» — арифметика без Date и без TZ.
    const total = year * 12 + (month - 1) - lag;
    if (total < 0) return null;

    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Ключ того же месяца год назад ('2026-02' → '2025-02'). */
export function samePeriodKey(monthKey: string): string | null {
    return shiftMonthKey(monthKey, SAME_PERIOD_LAG_MONTHS);
}

/** Первый день месяца 'YYYY-MM' → 'YYYY-MM-01'. */
function firstDayOf(monthKey: string): string {
    return `${monthKey}-01`;
}

/**
 * Последний день месяца 'YYYY-MM' по UTC-календарю: `Date.UTC(y, m, 0)` —
 * нулевой день следующего месяца, то есть последний день этого. Февраль
 * високосного года получает 29, обычного — 28 (границы окна событий
 * портала, TZ портала здесь не при чём: ключ месяца уже в ней).
 */
function lastDayOf(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();

    return `${monthKey}-${String(days).padStart(2, '0')}`;
}

/** Сравнимы ли значения состава: оба известны и различаются — нет. */
function changed(
    current: string | number | null | undefined,
    base: string | number | null | undefined,
): boolean {
    if (current === null || current === undefined) return false;
    if (base === null || base === undefined) return false;

    return current !== base;
}

/** Есть ли событие журнала внутри полуинтервала (baseFrom; currentTo]. */
function hasEventBetween(
    events: readonly string[] | undefined,
    afterDay: string,
    untilDay: string,
): boolean {
    return (events ?? []).some(day => day > afterDay && day <= untilDay);
}

/** Причины в фиксированном порядке и без повторов. */
function orderReasons(
    reasons: readonly SamePeriodReason[],
): SamePeriodReason[] {
    const found = new Set(reasons);

    return REASON_ORDER.filter(reason => found.has(reason));
}

/** Пара без данных: ни одного числа наружу, причина названа. */
function unavailable(
    periodKey: string | null,
    basePeriodKey: string | null,
    reason: SamePeriodReason,
): SamePeriodPair {
    return {
        periodKey,
        basePeriodKey,
        available: false,
        comparable: false,
        reasons: [reason],
    };
}

/**
 * Пара периодов «сейчас и год назад» и её сопоставимость.
 *
 * `available: false` — показывать нечего: зерно не месяц
 * (`period-not-month`) либо снапшота M−12 нет (`no-history`).
 * `available: true, comparable: false` — числа обоих периодов есть, но
 * рядом их читают с оговоркой: сменились версии разбора, граница
 * сравнимой истории прошла внутри года, менеджер сменил отдел, уровень
 * или полосу стажа, между периодами есть событие портала.
 */
export function selectSamePeriod(input: SamePeriodInput): SamePeriodPair {
    const grain = input.grain ?? 'month';
    if (grain !== 'month' || !isMonthKey(input.periodKey)) {
        return unavailable(
            isMonthKey(input.periodKey) ? input.periodKey : null,
            null,
            SAME_PERIOD_REASONS.periodNotMonth,
        );
    }
    const basePeriodKey = samePeriodKey(input.periodKey);
    if (basePeriodKey === null || !input.basePresent) {
        return unavailable(
            input.periodKey,
            basePeriodKey,
            SAME_PERIOD_REASONS.noHistory,
        );
    }
    const reasons: SamePeriodReason[] = [];
    if (changed(input.current?.versions, input.base?.versions)) {
        reasons.push(SAME_PERIOD_REASONS.versionsChanged);
    }
    if (
        typeof input.comparableFrom === 'string' &&
        input.comparableFrom > firstDayOf(basePeriodKey)
    ) {
        reasons.push(SAME_PERIOD_REASONS.beforeComparable);
    }
    if (changed(input.current?.departmentId, input.base?.departmentId)) {
        reasons.push(SAME_PERIOD_REASONS.departmentChanged);
    }
    if (changed(input.current?.level, input.base?.level)) {
        reasons.push(SAME_PERIOD_REASONS.levelChanged);
    }
    if (changed(input.current?.tenureBand, input.base?.tenureBand)) {
        reasons.push(SAME_PERIOD_REASONS.tenureBandChanged);
    }
    if (
        hasEventBetween(
            input.portalEvents,
            lastDayOf(basePeriodKey),
            lastDayOf(input.periodKey),
        )
    ) {
        reasons.push(SAME_PERIOD_REASONS.portalEvent);
    }

    return {
        periodKey: input.periodKey,
        basePeriodKey,
        available: true,
        comparable: reasons.length === 0,
        reasons: orderReasons(reasons),
    };
}

/** Последний день месяца 'YYYY-MM' — граница окна событий портала. */
export const monthLastDay = lastDayOf;

/** Первый день месяца 'YYYY-MM' — граница `comparableFrom`. */
export const monthFirstDay = firstDayOf;
