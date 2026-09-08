/**
 * Готовность витрины и «честное мало данных» (план §4.11) — единственный
 * источник правил режимов. Пресентер приложения
 * (`domain/presenter/readiness.util.ts`) обязан быть тонким адаптером:
 * собрать `ReadinessInput` из строк витрины и снапшотов, позвать
 * `buildReadiness` и разложить результат в `ReadinessDto`; собственных
 * гейтов и порогов адаптер не держит.
 *
 * Чистая математика: без DI, без `Date.now()` и `Math.random()` внутри —
 * время и пороги приходят параметрами.
 */
import type { AiBetaSource } from '../contracts/quality-link.types';
import type { BetaGateCountdown } from './beta-power';

/** Режимы готовности витрины (план §4.11). */
export const AI_READINESS_MODES = [
    'calibration',
    'descriptive',
    'norms',
    'hypothesis',
    'forecast',
    'recommendations',
    'kpi-only',
] as const;
export type AiReadinessMode = (typeof AI_READINESS_MODES)[number];

/** Коды причин режима; к части кодов добавляется значение гейта. */
export const AI_READINESS_REASON_CODES = {
    /** Аналитика включена, но разборов в окне конвейера нет. */
    kpiOnly: 'no-analysis-in-pipeline-window',
    /** Месяцев истории меньше калибровочного гейта. */
    historyShort: 'history-months-below',
    /** Разобранных презентаций меньше калибровочного гейта. */
    presentationsFew: 'presentations-below',
    /** Презентаций меньше гейта норм (L2). */
    normsPresentationsFew: 'norms-presentations-below',
    /** Производственный календарь портала не импортирован. */
    calendarMissing: 'calendar-not-imported',
    /** Состав и уровни менеджеров не подтверждены РОПом. */
    rosterNotConfirmed: 'roster-not-confirmed',
    /** Гипотеза портала «качество → объём» не задана (нужно ≥ 2 пар). */
    hypothesisMissing: 'hypothesis-not-set',
} as const;
export type AiReadinessReasonCode =
    (typeof AI_READINESS_REASON_CODES)[keyof typeof AI_READINESS_REASON_CODES];

/** Причина с гейтом в коде: `history-months-below-3`, `presentations-below-60`. */
export function readinessReason(
    code: AiReadinessReasonCode,
    gate?: number,
): string {
    return gate === undefined ? code : `${code}-${gate}`;
}

/**
 * Счётчик «до оценки β» (решение А.3): считает `model/beta-power.ts`,
 * готовность его только пробрасывает и гасит после прохождения гейта.
 */
export type BetaCountdown = BetaGateCountdown;

/** Гейты режимов; значения приходят из реестра параметров. */
export interface ReadinessGates {
    /** `calibration_min_months`: месяцев истории для выхода из калибровки. */
    calibrationMonths: number;
    /** Презентаций для выхода из калибровки (гейт витрины — 60). */
    calibrationPresentations: number;
    /** `calibration_min_presentations`: гейт L2, презентаций для норм. */
    normsPresentations: number;
    /** `roster_confirm_required`: нужна ли явная дата подтверждения состава. */
    rosterConfirmRequired: boolean;
}

/** Дефолты гейтов (план §4.11); реестр их переопределяет. */
export const AI_READINESS_GATE_DEFAULTS: ReadinessGates = {
    calibrationMonths: 3,
    calibrationPresentations: 60,
    normsPresentations: 100,
    rosterConfirmRequired: false,
};

/** Вход правил режимов: витрина, снапшоты и настройки портала. */
export interface ReadinessInput {
    /** Аналитика включена для портала. */
    enabled: boolean;
    /** Есть разборы в окне конвейера; иначе режим `kpi-only`. */
    pipelineEnabled: boolean;
    /** Месяцев истории разборов (по первому разобранному звонку). */
    historyMonths: number;
    /** Разобранных подтверждённых презентаций за окно готовности. */
    presentations: number;
    /** Продаж за окно готовности. */
    sales: number;
    /** Дата сопоставимости версий 'YYYY-MM-DD'; '' — версий нет. */
    comparableFrom: string;
    /** Производственный календарь портала импортирован. */
    calendarImported: boolean;
    /** Записей в `ai_analytics_levels` (уровни менеджеров). */
    rosterLevels: number;
    /** `ai_analytics_roster_confirmed_at`: 'YYYY-MM-DD' либо ''. */
    rosterConfirmedAt: string;
    /** Пар в `ai_analytics_hypothesis`; режим `hypothesis` требует ≥ 2. */
    hypothesisPairs: number;
    /** Источник β на входе (из QualityLink портала). */
    betaSource: AiBetaSource;
    /** Счётчик до гейта β; null — считать не из чего. */
    betaCountdown?: BetaCountdown | null;
}

/** Результат правил режимов; адаптер раскладывает его в `ReadinessDto`. */
export interface ReadinessResult {
    mode: AiReadinessMode;
    reasons: string[];
    historyMonths: number;
    presentations: number;
    sales: number;
    comparableFrom: string;
    betaSource: AiBetaSource;
    /** null при `betaSource: 'data'` (гейт пройден) и в режиме `kpi-only`. */
    betaCountdown: BetaCountdown | null;
}

/** Минимум пар гипотезы портала для режима `hypothesis`. */
export const AI_READINESS_MIN_HYPOTHESIS_PAIRS = 2;

/**
 * Гейт «состав подтверждён»: при `roster_confirm_required = false` хватает
 * непустых уровней, при `true` нужна дата подтверждения РОПом.
 */
export function isRosterConfirmed(
    input: Pick<ReadinessInput, 'rosterLevels' | 'rosterConfirmedAt'>,
    gates: ReadinessGates = AI_READINESS_GATE_DEFAULTS,
): boolean {
    if (gates.rosterConfirmRequired) {
        return input.rosterConfirmedAt.trim().length > 0;
    }

    return input.rosterLevels > 0;
}

/** Причины, по которым портал не дотягивает до калибровочного гейта. */
function calibrationReasons(
    input: ReadinessInput,
    gates: ReadinessGates,
): string[] {
    const reasons: string[] = [];
    if (input.historyMonths < gates.calibrationMonths) {
        reasons.push(
            readinessReason(
                AI_READINESS_REASON_CODES.historyShort,
                gates.calibrationMonths,
            ),
        );
    }
    if (input.presentations < gates.calibrationPresentations) {
        reasons.push(
            readinessReason(
                AI_READINESS_REASON_CODES.presentationsFew,
                gates.calibrationPresentations,
            ),
        );
    }

    return reasons;
}

/** Причины, по которым режим не поднимается с `descriptive` до `norms`. */
function normsReasons(input: ReadinessInput, gates: ReadinessGates): string[] {
    const reasons: string[] = [];
    if (input.presentations < gates.normsPresentations) {
        reasons.push(
            readinessReason(
                AI_READINESS_REASON_CODES.normsPresentationsFew,
                gates.normsPresentations,
            ),
        );
    }
    if (!input.calendarImported) {
        reasons.push(AI_READINESS_REASON_CODES.calendarMissing);
    }
    if (!isRosterConfirmed(input, gates)) {
        reasons.push(AI_READINESS_REASON_CODES.rosterNotConfirmed);
    }

    return reasons;
}

/** Источник β на выходе: `hypothesis` — только при достижимом режиме. */
function outputBetaSource(
    input: ReadinessInput,
    hypothesisReached: boolean,
): AiBetaSource {
    if (input.betaSource === 'data') {
        return 'data';
    }

    return hypothesisReached ? 'hypothesis' : 'none';
}

/**
 * Режим готовности и счётчик до гейта β. Лестница Фазы 2:
 * `kpi-only` → `calibration` → `descriptive` → `norms` → `hypothesis`.
 * Режимы `forecast` (L4) и `recommendations` (L5) объявлены в союзе, но в
 * Фазе 2 недостижимы: их гейты считаются в Фазе 4.
 */
export function buildReadiness(
    input: ReadinessInput,
    gates: ReadinessGates = AI_READINESS_GATE_DEFAULTS,
): ReadinessResult {
    const base = {
        historyMonths: input.historyMonths,
        presentations: input.presentations,
        sales: input.sales,
        comparableFrom: input.comparableFrom,
    };
    // Счётчик показывается с первого дня (решение А.3) и гаснет,
    // когда гейт уже пройден и β считается по данным.
    const countdown =
        input.betaSource === 'data' ? null : (input.betaCountdown ?? null);

    if (input.enabled && !input.pipelineEnabled) {
        return {
            ...base,
            mode: 'kpi-only',
            reasons: [AI_READINESS_REASON_CODES.kpiOnly],
            betaSource: outputBetaSource(input, false),
            betaCountdown: null,
        };
    }

    const calibration = calibrationReasons(input, gates);
    if (calibration.length) {
        return {
            ...base,
            mode: 'calibration',
            reasons: calibration,
            betaSource: outputBetaSource(input, false),
            betaCountdown: countdown,
        };
    }

    const blocked = normsReasons(input, gates);
    if (blocked.length) {
        return {
            ...base,
            mode: 'descriptive',
            reasons: blocked,
            betaSource: outputBetaSource(input, false),
            betaCountdown: countdown,
        };
    }

    const hypothesisReached =
        input.betaSource === 'hypothesis' &&
        input.hypothesisPairs >= AI_READINESS_MIN_HYPOTHESIS_PAIRS;
    const reasons =
        input.betaSource === 'hypothesis' && !hypothesisReached
            ? [AI_READINESS_REASON_CODES.hypothesisMissing]
            : [];

    return {
        ...base,
        mode: hypothesisReached ? 'hypothesis' : 'norms',
        reasons,
        betaSource: outputBetaSource(input, hypothesisReached),
        betaCountdown: countdown,
    };
}

/**
 * Доверие к значению за период и метрика с ним — в соседнем файле
 * `model/readiness-confidence.ts` (правила показа одного числа отделены
 * от правил режимов витрины).
 */
export { confidenceForPeriod, metricForPeriod } from './readiness-confidence';
