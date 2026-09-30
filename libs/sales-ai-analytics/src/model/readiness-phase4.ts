/**
 * Ступени готовности Фазы 4 (план §4.11, §10): `forecast` (L4) и
 * `recommendations` (L5) поверх лестницы Фазы 2 (`model/readiness.ts`).
 *
 * Правила:
 * - ступени последовательны: `forecast` рассматривается только с режимов
 *   `norms` и `hypothesis` (режим `hypothesis` — побочное состояние норм и
 *   не блокирует прогноз), `recommendations` — только после пройденного L4;
 * - гейт считается автоматически по последним снапшотам точности прогноза
 *   (`forecast-backtest`) и эффекта советов (`recommendation-effect`), а
 *   переход в режим — только при флаге портала (`forecast_stage_enabled`,
 *   `recommendations_stage_enabled`); гейт пройден, флаг выключен — режим
 *   остаётся ниже с причиной «ступень выключена»;
 * - ступень ничего не отнимает у базового результата: причины базы
 *   сохраняются, причины ступеней дописываются следом.
 *
 * Чистые функции: без DI, `Date.now()` и `Math.random()`.
 */
import type {
    ForecastBacktestSnapshot,
    RecommendationEffectSnapshot,
} from '../contracts/snapshot.phase4.types';
import type { ForecastBacktestReason } from './forecast-backtest.types';
import type { AiReadinessMode, ReadinessResult } from './readiness';
import {
    AI_READINESS_FORECAST_BASE_MODES,
    AI_READINESS_PHASE4_REASON_CODES,
    AI_READINESS_STAGE_GATE_DEFAULTS,
    readinessStageReason,
    type AiReadinessPhase4ReasonCode,
    type ReadinessForecastStage,
    type ReadinessRecommendationsEffectFacts,
    type ReadinessRecommendationsStage,
    type ReadinessStageFlags,
    type ReadinessStageGates,
    type ReadinessStages,
} from './readiness-phase4.types';
import type { RecommendationGateReason } from './recommendation-effect.types';

export * from './readiness-phase4.types';

/** Вход L4 из снапшота точности прогноза; нет снапшота — журнала нет. */
export function forecastStageOf(
    snapshot: Pick<
        ForecastBacktestSnapshot,
        'status' | 'reasons' | 'shadowMonths'
    > | null,
    stageEnabled: boolean,
): ReadinessForecastStage {
    if (snapshot === null) {
        return { stageEnabled, shadowMonths: 0, backtest: null };
    }

    return {
        stageEnabled,
        shadowMonths: Math.max(0, snapshot.shadowMonths),
        backtest: { status: snapshot.status, reasons: [...snapshot.reasons] },
    };
}

/** Вход L5 из снапшота эффекта советов; нет снапшота — оценки нет. */
export function recommendationsStageOf(
    snapshot: Pick<RecommendationEffectSnapshot, 'gate' | 'params'> | null,
    stageEnabled: boolean,
): ReadinessRecommendationsStage {
    if (snapshot === null) {
        return { stageEnabled, effect: null };
    }

    return {
        stageEnabled,
        effect: {
            status: snapshot.gate.status,
            reasons: [...snapshot.gate.reasons],
            minIssued: snapshot.params.minIssued,
            minN: snapshot.params.minN,
        },
    };
}

/**
 * Входы обеих ступеней из последних снапшотов и флагов портала. Нет ни
 * снапшотов, ни включённых флагов — Фаза 4 на портале не начиналась:
 * ступени не рассматриваются (null), и в причинах нет шума «журнала ещё
 * нет». Включён флаг или есть хоть один снапшот — ступени считаются.
 */
export function readinessStagesFrom(
    forecastBacktest: Parameters<typeof forecastStageOf>[0],
    recommendationEffect: Parameters<typeof recommendationsStageOf>[0],
    flags: ReadinessStageFlags,
): ReadinessStages | null {
    if (
        forecastBacktest === null &&
        recommendationEffect === null &&
        !flags.forecast &&
        !flags.recommendations
    ) {
        return null;
    }

    return {
        forecast: forecastStageOf(forecastBacktest, flags.forecast),
        recommendations: recommendationsStageOf(
            recommendationEffect,
            flags.recommendations,
        ),
    };
}

const CODES = AI_READINESS_PHASE4_REASON_CODES;

const MASE_REASONS: readonly ForecastBacktestReason[] = [
    'mase-naive',
    'mase-mean3',
    'mase-undefined',
];

/** Причины, по которым ступень L4 не пройдена; пусто — гейт пройден. */
function forecastGateReasons(
    stage: ReadinessForecastStage,
    gates: ReadinessStageGates,
): string[] {
    const backtest = stage.backtest;
    if (backtest === null) {
        return [CODES.forecastLogMissing];
    }
    const reasons: string[] = [];
    if (stage.shadowMonths < gates.forecastShadowMonths) {
        reasons.push(
            readinessStageReason(
                CODES.forecastShadowMonths,
                gates.forecastShadowMonths,
            ),
        );
    }
    if (backtest.status === 'insufficient') {
        reasons.push(CODES.forecastBacktestInsufficient);
    }
    if (backtest.reasons.includes('coverage-below')) {
        reasons.push(CODES.forecastCoverage);
    }
    if (backtest.reasons.some(reason => MASE_REASONS.includes(reason))) {
        reasons.push(CODES.forecastMase);
    }
    // Провал без известной причины (чужая форма) — не «пройдено».
    if (backtest.status !== 'pass' && reasons.length === 0) {
        reasons.push(CODES.forecastBacktestInsufficient);
    }

    return reasons;
}

/** Причина L5 по коду гейта эффекта советов. */
function recommendationReasonOf(
    reason: RecommendationGateReason,
    effect: ReadinessRecommendationsEffectFacts,
    gates: ReadinessStageGates,
): string {
    switch (reason) {
        case 'issued-below-min':
            return readinessStageReason(
                CODES.recommendationsIssued,
                effect.minIssued ?? gates.recommendationsMinIssued,
            );
        case 'issued-below-n-min':
            return readinessStageReason(
                CODES.recommendationsSharesIssued,
                effect.minN ?? gates.recommendationsMinN,
            );
        case 'done-share-below':
            return CODES.recommendationsDoneShare;
        case 'disagree-above':
            return CODES.recommendationsDisagree;
        case 'no-positive-edge':
            return CODES.recommendationsNoPositiveEdge;
        case 'goodhart-flags':
            return CODES.recommendationsGoodhart;
    }
}

/** Причины, по которым ступень L5 не пройдена; пусто — гейт пройден. */
function recommendationsGateReasons(
    stage: ReadinessRecommendationsStage,
    gates: ReadinessStageGates,
): string[] {
    const effect = stage.effect;
    if (effect === null) {
        return [CODES.recommendationsEffectMissing];
    }
    const reasons = [
        ...new Set(
            effect.reasons.map(reason =>
                recommendationReasonOf(reason, effect, gates),
            ),
        ),
    ];
    // Не «пройдено» без известной причины (чужая форма) — как нет оценки.
    if (effect.status !== 'pass' && reasons.length === 0) {
        reasons.push(CODES.recommendationsEffectMissing);
    }

    return reasons;
}

/** Ступень пройдена по гейту: причин нет. Флаг проверяется отдельно. */
const withFlag = (
    reasons: string[],
    enabled: boolean,
    disabledCode: AiReadinessPhase4ReasonCode,
): string[] => (reasons.length === 0 && !enabled ? [disabledCode] : reasons);

/**
 * Режим с учётом ступеней L4/L5. Базовый режим ниже `norms` (калибровка,
 * описательный, только KPI) не трогается: причины нижних ступеней важнее.
 * Прогноз не пройден — режим остаётся базовым с причинами L4; пройден —
 * `forecast` и причины L5 (если ступень задана); пройдены обе —
 * `recommendations`. Советы без пройденного прогноза не поднимают режим:
 * при включённом флаге или пройденном гейте советов добавляется причина
 * «нужен прогноз».
 */
export function elevateReadiness(
    base: ReadinessResult,
    stages: ReadinessStages,
    gates: ReadinessStageGates = AI_READINESS_STAGE_GATE_DEFAULTS,
): ReadinessResult {
    const eligible = (
        AI_READINESS_FORECAST_BASE_MODES as readonly AiReadinessMode[]
    ).includes(base.mode);
    const forecast = stages.forecast ?? null;
    const recommendations = stages.recommendations ?? null;
    if (!eligible || (forecast === null && recommendations === null)) {
        return base;
    }
    const recommendationReasons =
        recommendations === null
            ? null
            : withFlag(
                  recommendationsGateReasons(recommendations, gates),
                  recommendations.stageEnabled,
                  CODES.recommendationsDisabled,
              );
    const forecastReasons =
        forecast === null
            ? null
            : withFlag(
                  forecastGateReasons(forecast, gates),
                  forecast.stageEnabled,
                  CODES.forecastDisabled,
              );

    if (forecastReasons === null || forecastReasons.length > 0) {
        const recommendationsWaiting =
            recommendations !== null &&
            (recommendations.stageEnabled ||
                recommendations.effect?.status === 'pass');

        return {
            ...base,
            reasons: [
                ...base.reasons,
                ...(forecastReasons ?? []),
                ...(recommendationsWaiting
                    ? [CODES.recommendationsNeedsForecast]
                    : []),
            ],
        };
    }
    if (recommendationReasons === null || recommendationReasons.length > 0) {
        return {
            ...base,
            mode: 'forecast',
            reasons: [...base.reasons, ...(recommendationReasons ?? [])],
        };
    }

    return { ...base, mode: 'recommendations', reasons: [...base.reasons] };
}
