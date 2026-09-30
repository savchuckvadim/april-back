/**
 * Оценка связи «качество звонка → ближний исход» за месяц (план
 * `ai-sales-analytics` §4.4 «модель по умолчанию», «мощность и гейт»,
 * §4.11 «ежемесячно»; Фаза 4, П15/П20) → нагрузка снапшота
 * `ai-analytics-quality-link` (`QualityLinkSnapshot` библиотеки).
 *
 * Порядок: `fitBeta` (Мундлак + pooled, правило EPV, поправка на
 * надёжность `r`) → калибровка pooled-модели (наклон, корзины, плацебо) →
 * гейт с гистерезисом по серии прошлого месяца → кривая `p̂(S)` → счётчик
 * «до оценки связи» по фактическому дизайну выборки.
 *
 * ⚠ Нехватка данных — НЕ пропуск шага: снапшот пишется со статусом
 * `insufficient`, оценками null и причиной, гейт получает «оценки нет» —
 * серия обнуляется, а причина доходит до витрины и админки.
 *
 * Чистая функция: без DI, `new Date()` и случайности.
 */
import {
    AI_QUALITY_LINK_REASONS,
    BETA_GATE_DEFAULTS,
    betaCountdownFromSample,
    buildQualityLinkFromFit,
    calibrateBetaFit,
    evaluateBetaGate,
    fitBeta,
    resolveNumberParam,
    type AiQualityLinkReason,
    type AiQualityLinkStatus,
    type AiSnapshotMeta,
    type BetaCalibration,
    type BetaFit,
    type BetaGateCountdown,
    type BetaSample,
    type ParamContext,
    type QualityLinkSampleFacts,
    type QualityLinkSnapshot,
} from '@lib/sales-ai-analytics';

/** Параметры оценки из реестра портала; undefined — дефолт библиотеки. */
export interface QualityLinkParams {
    readonly managerEffectSd?: number;
    readonly minEpv?: number;
    readonly z?: number;
    readonly bins?: number;
    readonly gateSe?: number;
    readonly gateMonths?: number;
    readonly minN?: number;
}

export interface QualityLinkAssemblyInput {
    readonly monthKey: string;
    readonly sample: BetaSample;
    /**
     * Причина «данных нет» до оценки (нет истории стадий, нет звонков);
     * undefined — данные были, решает объём и сходимость.
     */
    readonly dataReason?: AiQualityLinkReason;
    /** `icc_form` из отчёта согласия; null — не измерена. */
    readonly reliability: number | null;
    /** Серия гейта прошлого месяца. */
    readonly previousStreak: number;
    readonly timestampLeakOk: boolean;
    /** Опорное качество модели портала; null — среднее S выборки. */
    readonly sRef: number | null;
    readonly params: QualityLinkParams;
    readonly meta: AiSnapshotMeta;
}

const EMPTY_CALIBRATION: BetaCalibration = {
    slope: null,
    bins: [],
    placebo: null,
};

/** Параметры оценки и гейта из слоёв реестра портала. */
export function qualityLinkParamsOf(registry: ParamContext): QualityLinkParams {
    return {
        managerEffectSd: resolveNumberParam('beta_manager_effect_sd', registry),
        minEpv: resolveNumberParam('beta_min_epv', registry),
        z: resolveNumberParam('z_compare', registry),
        bins: resolveNumberParam('beta_calibration_bins', registry),
        gateSe: resolveNumberParam('beta_gate_se', registry),
        gateMonths: resolveNumberParam('beta_gate_months', registry),
        minN: resolveNumberParam('n_min_none', registry),
    };
}

/** Сводка выборки для снапшота: объём, события, окно месяцев. */
export function sampleFactsOf(sample: BetaSample): QualityLinkSampleFacts {
    const months = [...new Set(sample.rows.map(row => row.monthKey))].sort();

    return {
        n: sample.n,
        events: sample.events,
        managers: sample.managers,
        windowDays: sample.windowDays,
        dropped: sample.dropped,
        fromMonth: months[0] ?? null,
        toMonth: months[months.length - 1] ?? null,
    };
}

/** Почему оценки нет; пусто — оценка есть. */
function insufficientReasons(
    input: QualityLinkAssemblyInput,
    fit: BetaFit | null,
): AiQualityLinkReason[] {
    if (input.dataReason !== undefined) return [input.dataReason];
    const minN = input.params.minN ?? 0;
    if (
        fit === null ||
        input.sample.n < minN ||
        fit.form.pooled === 'insufficient' ||
        fit.pooled === null
    ) {
        return [AI_QUALITY_LINK_REASONS.sampleSmall];
    }

    return fit.converged ? [] : [AI_QUALITY_LINK_REASONS.notConverged];
}

/** Счётчик «до оценки связи»: темп — триггеров в месяц окна выборки. */
function countdownOf(
    input: QualityLinkAssemblyInput,
    published: boolean,
): BetaGateCountdown | null {
    if (published || input.dataReason !== undefined) return null;
    const months = new Set(input.sample.rows.map(row => row.monthKey)).size;

    return betaCountdownFromSample(input.sample, {
        presentationsPerMonth: months > 0 ? input.sample.n / months : 0,
        reliability: input.reliability,
        ...(input.params.gateSe === undefined
            ? {}
            : { seTarget: input.params.gateSe }),
        ...(input.params.gateMonths === undefined
            ? {}
            : { gateMonths: input.params.gateMonths }),
    });
}

/** Нагрузка снапшота `quality-link` за месяц. */
export function buildQualityLinkPayload(
    input: QualityLinkAssemblyInput,
): QualityLinkSnapshot {
    const { sample, params } = input;
    const fit =
        input.dataReason === undefined && sample.n > 0
            ? fitBeta(sample, {
                  reliability: input.reliability,
                  ...(params.managerEffectSd === undefined
                      ? {}
                      : { managerEffectSd: params.managerEffectSd }),
                  ...(params.minEpv === undefined
                      ? {}
                      : { minEpv: params.minEpv }),
                  ...(params.z === undefined ? {} : { z: params.z }),
              })
            : null;
    const reasons = insufficientReasons(input, fit);
    const estimated = fit !== null && reasons.length === 0 ? fit : null;
    const calibration =
        estimated === null
            ? EMPTY_CALIBRATION
            : calibrateBetaFit(sample, estimated, {
                  ...(params.bins === undefined ? {} : { bins: params.bins }),
                  ...(params.z === undefined ? {} : { z: params.z }),
              });
    const gate = evaluateBetaGate({
        se: estimated?.pooled?.se ?? null,
        calibrationCoversOne: calibration.slope?.coversOne ?? null,
        placeboPassed: calibration.placebo?.passed ?? null,
        timestampLeakOk: input.timestampLeakOk,
        previousStreak: input.previousStreak,
        ...(params.gateSe === undefined ? {} : { gateSe: params.gateSe }),
        ...(params.gateMonths === undefined
            ? {}
            : { gateMonths: params.gateMonths }),
    });
    const status: AiQualityLinkStatus =
        estimated === null
            ? 'insufficient'
            : gate.published
              ? 'published'
              : 'estimated';
    const link =
        estimated === null
            ? null
            : buildQualityLinkFromFit(
                  estimated,
                  input.sRef ?? sample.sBarPortal,
              );
    const curve = link?.curve ?? [];
    const correction = estimated?.reliability;

    return {
        monthKey: input.monthKey,
        status,
        reasons: [...reasons, ...gate.reasons],
        sample: sampleFactsOf(sample),
        within: estimated?.within ?? null,
        between: estimated?.between ?? null,
        pooled: estimated?.pooled ?? null,
        form: fit?.form ?? null,
        epv: fit?.epv ?? null,
        reliability: {
            r: fit?.reliability.r ?? input.reliability,
            rBetween: fit?.reliability.rBetween ?? null,
            within: correction?.within?.beta ?? null,
            between: correction?.between?.beta ?? null,
            pooled: correction?.pooled?.beta ?? null,
        },
        calibration: { slope: calibration.slope, bins: calibration.bins },
        placebo:
            calibration.placebo === null
                ? null
                : {
                      lead: calibration.placebo.lead,
                      passed: calibration.placebo.passed,
                      n: calibration.placebo.n,
                  },
        gate: {
            passedNow: gate.passedNow,
            streak: gate.streak,
            months: params.gateMonths ?? BETA_GATE_DEFAULTS.gateMonths,
            published: gate.published,
            timestampLeakOk: input.timestampLeakOk,
        },
        curve,
        sRef: curve.length > 0 && link !== null ? link.sRef : null,
        pRef: curve.length > 0 ? (link?.pRef ?? null) : null,
        countdown: countdownOf(input, gate.published),
        meta: input.meta,
    };
}
