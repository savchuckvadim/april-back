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
import { registryDefault } from '../params/registry.access';
import type { BetaGateCountdown } from './beta-power';
import type { ReliabilitySource } from './reliability';

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
    /**
     * Снапшота месячной модели портала нет (план §5.4): нормы пустые,
     * `priorSource: 'none'`, поэтому режим не поднимается выше
     * `descriptive` — «нормы» без норм показывать нельзя.
     */
    modelMissing: 'no-portal-model',
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
    /** Презентаций для выхода из калибровки (гейт витрины). */
    calibrationPresentations: number;
    /** `calibration_min_presentations`: гейт L2, презентаций для норм. */
    normsPresentations: number;
    /** `roster_confirm_required`: нужна ли явная дата подтверждения состава. */
    rosterConfirmRequired: boolean;
}

/**
 * Дефолты гейтов (план §4.11) — из реестра параметров: контекст портала
 * переопределяет их через `resolveParam` тех же кодов.
 */
export const AI_READINESS_GATE_DEFAULTS: ReadinessGates = {
    /** `calibration_min_months`. */
    calibrationMonths: registryDefault('calibration_min_months'),
    /**
     * Не параметр реестра: гейт витрины «60 презентаций» — решение плана
     * §4.11; `calibration_min_presentations` — гейт норм L2, он ниже по
     * лестнице не опускается.
     */
    calibrationPresentations: 60,
    /** `calibration_min_presentations` — гейт норм L2. */
    normsPresentations: registryDefault('calibration_min_presentations'),
    /** `roster_confirm_required`. */
    rosterConfirmRequired: registryDefault('roster_confirm_required'),
};

/** Вход правил режимов: витрина, снапшоты и настройки портала. */
export interface ReadinessInput {
    /** Аналитика включена для портала. */
    enabled: boolean;
    /** Есть разборы в окне конвейера; иначе режим `kpi-only`. */
    pipelineEnabled: boolean;
    /**
     * Месяцев истории в окне готовности. Окно выбирает
     * `readiness-window.ts`: при живой модели портала это глубина истории
     * стадий её окна (`SnapshotReadiness.historyMonths`, до 12 месяцев),
     * без модели — месяцы от первого разобранного звонка периода.
     * Величины разнородны, но обе отвечают на один вопрос гейта: «сколько
     * месяцев портал уже наблюдается».
     */
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
    /**
     * Снапшот месячной модели портала посчитан (план §5.4). `false` —
     * кап: режим не выше `descriptive` с причиной `no-portal-model`;
     * `undefined` — кап не применяется (прежнее поведение для вызывающих,
     * которые про модель не знают, и для сборки самой модели).
     */
    portalModelPresent?: boolean;
    /**
     * Источник σ_llm (Фаза 3, П7): measured — отчёт согласия test-retest
     * прошёл ценз пар, configured — дефолт реестра; не задан — вызывающий
     * про отчёт не знает, поле в результате не появляется.
     */
    sigmaLlmSource?: ReliabilitySource;
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
    /** Источник σ_llm, если вызывающий его передал (П7). */
    sigmaLlmSource?: ReliabilitySource;
}

/**
 * Минимум пар гипотезы портала для режима `hypothesis`.
 * Не параметр реестра: по одной паре наклон не строится — это условие
 * метода (план §4.11), а не настройка портала.
 */
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
    // Кап §5.4 — после гейтов: гейты руководитель закрывает сам, а
    // модель считает ночной конвейер, и ждать её остаётся в конце списка.
    if (input.portalModelPresent === false) {
        reasons.push(AI_READINESS_REASON_CODES.modelMissing);
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
 *
 * Кап §5.4: при `portalModelPresent: false` подъём выше `descriptive`
 * закрыт причиной `no-portal-model` даже при пройденных гейтах норм.
 * Режимы ниже (`kpi-only`, `calibration`) кап не трогает — они и так
 * ниже потолка, а их причины важнее.
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
    const sigma =
        input.sigmaLlmSource === undefined
            ? {}
            : { sigmaLlmSource: input.sigmaLlmSource };

    if (input.enabled && !input.pipelineEnabled) {
        return {
            ...base,
            ...sigma,
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
            ...sigma,
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
            ...sigma,
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
