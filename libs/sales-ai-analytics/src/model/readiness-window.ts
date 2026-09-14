/**
 * Окно готовности витрины (план §4.11, находка M9 аудита Фазы 2): откуда
 * берутся счётчики режима — из окна месячной модели портала (12 месяцев)
 * или из запрошенного периода витрины (он ограничен тремя месяцами, и на
 * обычном месячном периоде режим `norms` по нему недостижим никогда).
 *
 * Правило живёт здесь, рядом с `buildReadiness`, а не в приложении:
 * `apps/.../domain/presenter/readiness.util.ts` обязан оставаться тонким
 * адаптером и своих порогов не держать (§5.1). Сюда же вынесена причина
 * «качество данных» — вердикт санити-панели модели портала, который
 * доезжает до баннера витрины отдельной строкой причин.
 *
 * Чистые функции: без DI, без `Date.now()` и без `Math.random()` внутри.
 */
import {
    buildReadiness,
    type ReadinessGates,
    type ReadinessInput,
    type ReadinessResult,
} from './readiness';

/** Источник счётчиков окна готовности. */
export const AI_READINESS_WINDOW_SOURCES = ['model', 'period'] as const;
export type AiReadinessWindowSource =
    (typeof AI_READINESS_WINDOW_SOURCES)[number];

/**
 * Причины готовности, которые приходят не из гейтов режимов, а из
 * качества данных: их добавляет к `reasons` эта обёртка.
 */
export const AI_READINESS_QUALITY_REASON_CODES = {
    /**
     * Плацебо-тест меток времени санити-панели: продажи закрываются
     * раньше активностей, которые их «объясняют» (`dataQuality: flagged`).
     */
    timestampLeak: 'data-quality-timestamp-leak',
} as const;
export type AiReadinessQualityReasonCode =
    (typeof AI_READINESS_QUALITY_REASON_CODES)[keyof typeof AI_READINESS_QUALITY_REASON_CODES];

/** Счётчики одного окна: месяцы истории и разобранные презентации. */
export interface ReadinessWindowCounters {
    /** Месяцев истории разборов в окне. */
    readonly historyMonths: number;
    /** Разобранных подтверждённых презентаций в окне. */
    readonly presentations: number;
    /** Ширина окна, месяцев; 0 — ширина неизвестна. */
    readonly months?: number;
}

/** Выбранное окно готовности и то, чем оно посчитано. */
export interface ReadinessWindow {
    readonly historyMonths: number;
    readonly presentations: number;
    readonly months: number;
    readonly source: AiReadinessWindowSource;
}

/** Неотрицательное целое из чужой (JSON) нагрузки; иначе 0. */
function counter(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 0;
}

/** Окно знает хоть что-то: иначе брать из него нечего. */
function isFilled(counters: ReadinessWindowCounters): boolean {
    return (
        counter(counters.historyMonths) > 0 ||
        counter(counters.presentations) > 0
    );
}

/**
 * Окно готовности: при живой модели портала счётчики берутся из её окна
 * (12 месяцев), иначе остаётся период витрины (штатная деградация §5.4 —
 * режим не поднимается выше того, что видно за период).
 *
 * По каждому счётчику берётся максимум: окно модели ШИРЕ периода и почти
 * всегда его накрывает, но модель считается раз в месяц и может отстать —
 * тогда свежий период не должен пропадать.
 */
export function resolveReadinessWindow(
    period: ReadinessWindowCounters,
    model?: ReadinessWindowCounters | null,
): ReadinessWindow {
    if (model === null || model === undefined || !isFilled(model)) {
        return {
            historyMonths: counter(period.historyMonths),
            presentations: counter(period.presentations),
            months: counter(period.months),
            source: 'period',
        };
    }

    return {
        historyMonths: Math.max(
            counter(model.historyMonths),
            counter(period.historyMonths),
        ),
        presentations: Math.max(
            counter(model.presentations),
            counter(period.presentations),
        ),
        months: Math.max(counter(model.months), counter(period.months)),
        source: 'model',
    };
}

/** Вход готовности по окну: правила режимов + два окна + качество данных. */
export interface WindowedReadinessInput {
    /** Всё, что не зависит от окна: флаги портала, продажи, состав, β. */
    readonly rules: Omit<ReadinessInput, 'historyMonths' | 'presentations'>;
    /** Счётчики запрошенного периода витрины. */
    readonly period: ReadinessWindowCounters;
    /** Счётчики окна модели портала; null — снапшота модели нет. */
    readonly model?: ReadinessWindowCounters | null;
    /** Санити-панель модели пометила качество данных (`flagged`). */
    readonly dataQualityFlagged?: boolean;
}

/** Результат правил режимов плюс окно, по которому они посчитаны. */
export interface WindowedReadinessResult extends ReadinessResult {
    readonly window: ReadinessWindow;
}

/**
 * Готовность по окну: выбирает окно, зовёт правила режимов библиотеки и
 * дописывает причину качества данных. Своих гейтов не добавляет — режим
 * и его причины целиком остаются за `buildReadiness`.
 */
export function buildWindowedReadiness(
    input: WindowedReadinessInput,
    gates?: ReadinessGates,
): WindowedReadinessResult {
    const window = resolveReadinessWindow(input.period, input.model);
    const rules: ReadinessInput = {
        ...input.rules,
        historyMonths: window.historyMonths,
        presentations: window.presentations,
    };
    const result = buildReadiness(rules, gates);

    return {
        ...result,
        reasons:
            input.dataQualityFlagged === true
                ? [
                      ...result.reasons,
                      AI_READINESS_QUALITY_REASON_CODES.timestampLeak,
                  ]
                : result.reasons,
        window,
    };
}
