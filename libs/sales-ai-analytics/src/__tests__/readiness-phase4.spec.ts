import type {
    ForecastBacktestSnapshot,
    RecommendationEffectSnapshot,
} from '../contracts/snapshot.phase4.types';
import type { ReadinessResult } from '../model/readiness';
import {
    AI_READINESS_PHASE4_REASON_CODES as CODES,
    AI_READINESS_STAGE_GATE_DEFAULTS,
    elevateReadiness,
    forecastStageOf,
    readinessStageFlagsOf,
    readinessStageGatesOf,
    readinessStageReason,
    recommendationsStageOf,
    type ReadinessForecastStage,
    type ReadinessRecommendationsStage,
} from '../model/readiness-phase4';
import { registryDefault } from '../params/registry.access';

/**
 * Ступени L4/L5 (план §4.11, §10): гейты из реестра, последовательность
 * ступеней, флаг портала и причины с гейтом в коде.
 */

/** Портал на нормах: прошёл калибровку и гейты L2. */
const base = (over: Partial<ReadinessResult> = {}): ReadinessResult => ({
    mode: 'norms',
    reasons: [],
    historyMonths: 12,
    presentations: 400,
    sales: 40,
    comparableFrom: '',
    betaSource: 'none',
    betaCountdown: null,
    ...over,
});

const forecastPass = (
    over: Partial<ReadinessForecastStage> = {},
): ReadinessForecastStage => ({
    stageEnabled: true,
    shadowMonths: 12,
    backtest: { status: 'pass', reasons: [] },
    ...over,
});

const recommendationsPass = (
    over: Partial<ReadinessRecommendationsStage> = {},
): ReadinessRecommendationsStage => ({
    stageEnabled: true,
    effect: { status: 'pass', reasons: [] },
    ...over,
});

const SHADOW = AI_READINESS_STAGE_GATE_DEFAULTS.forecastShadowMonths;

describe('readiness-phase4: гейты и флаги из реестра', () => {
    it('дефолты гейтов — коды реестра', () => {
        expect(AI_READINESS_STAGE_GATE_DEFAULTS).toEqual({
            forecastShadowMonths: registryDefault('forecast_shadow_min_months'),
            recommendationsMinIssued: registryDefault(
                'recommendations_min_issued',
            ),
            recommendationsMinN: registryDefault('n_min_none'),
        });
        expect(SHADOW).toBe(9);
    });

    it('слой портала переопределяет гейт, неверное значение — дефолт', () => {
        expect(
            readinessStageGatesOf({
                portal: { forecast_shadow_min_months: 12 },
            }).forecastShadowMonths,
        ).toBe(12);
        expect(
            readinessStageGatesOf({
                portal: { forecast_shadow_min_months: 100 },
            }).forecastShadowMonths,
        ).toBe(SHADOW);
    });

    it('флаги ступеней по умолчанию выключены, включаются слоем портала', () => {
        expect(readinessStageFlagsOf()).toEqual({
            forecast: false,
            recommendations: false,
        });
        expect(
            readinessStageFlagsOf({
                portal: {
                    forecast_stage_enabled: true,
                    recommendations_stage_enabled: true,
                },
            }),
        ).toEqual({ forecast: true, recommendations: true });
    });

    it('причина с гейтом в коде', () => {
        expect(readinessStageReason(CODES.forecastShadowMonths, 9)).toBe(
            'forecast-shadow-months-below-9',
        );
        expect(readinessStageReason(CODES.forecastDisabled)).toBe(
            'forecast-stage-disabled',
        );
    });
});

describe('readiness-phase4: входы ступеней из снапшотов', () => {
    it('нет снапшота точности — журнала нет', () => {
        expect(forecastStageOf(null, true)).toEqual({
            stageEnabled: true,
            shadowMonths: 0,
            backtest: null,
        });
    });

    it('снапшот точности → статус, причины и теневые месяцы', () => {
        const snapshot: Pick<
            ForecastBacktestSnapshot,
            'status' | 'reasons' | 'shadowMonths'
        > = {
            status: 'fail',
            reasons: ['coverage-below'],
            shadowMonths: 10,
        };
        expect(forecastStageOf(snapshot, false)).toEqual({
            stageEnabled: false,
            shadowMonths: 10,
            backtest: { status: 'fail', reasons: ['coverage-below'] },
        });
    });

    it('снапшот эффекта → статус, причины и применённые гейты', () => {
        const snapshot = {
            gate: { status: 'insufficient', reasons: ['issued-below-min'] },
            params: {
                minIssued: 25,
                doneShareMin: 0.5,
                disagreeMax: 0.3,
                minN: 8,
                z: 1.645,
            },
        } as Pick<RecommendationEffectSnapshot, 'gate' | 'params'>;
        expect(recommendationsStageOf(snapshot, true)).toEqual({
            stageEnabled: true,
            effect: {
                status: 'insufficient',
                reasons: ['issued-below-min'],
                minIssued: 25,
                minN: 8,
            },
        });
        expect(recommendationsStageOf(null, false)).toEqual({
            stageEnabled: false,
            effect: null,
        });
    });
});

describe('elevateReadiness: ступень «прогноз» (L4)', () => {
    it('без ступеней режим не меняется', () => {
        const result = base();
        expect(elevateReadiness(result, {})).toBe(result);
    });

    it.each(['kpi-only', 'calibration', 'descriptive'] as const)(
        'режим %s ниже норм — ступени не рассматриваются',
        mode => {
            const result = base({ mode, reasons: ['x'] });
            expect(
                elevateReadiness(result, {
                    forecast: forecastPass(),
                    recommendations: recommendationsPass(),
                }),
            ).toBe(result);
        },
    );

    it('гейт пройден и флаг включён — forecast', () => {
        expect(
            elevateReadiness(base(), { forecast: forecastPass() }),
        ).toMatchObject({ mode: 'forecast', reasons: [] });
    });

    it('режим hypothesis не блокирует прогноз, причины базы сохраняются', () => {
        const result = elevateReadiness(
            base({
                mode: 'hypothesis',
                betaSource: 'hypothesis',
                reasons: ['data-quality-timestamp-leak'],
            }),
            { forecast: forecastPass() },
        );
        expect(result).toMatchObject({
            mode: 'forecast',
            betaSource: 'hypothesis',
            reasons: ['data-quality-timestamp-leak'],
        });
    });

    it('гейт пройден, флаг выключен — режим прежний с причиной', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass({ stageEnabled: false }),
            }),
        ).toMatchObject({ mode: 'norms', reasons: [CODES.forecastDisabled] });
    });

    it('журнала нет — forecast-log-missing', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass({ backtest: null, shadowMonths: 0 }),
            }),
        ).toMatchObject({
            mode: 'norms',
            reasons: [CODES.forecastLogMissing],
        });
    });

    it('теневых месяцев меньше гейта — причина с числом гейта', () => {
        const result = elevateReadiness(base(), {
            forecast: forecastPass({
                shadowMonths: 4,
                backtest: {
                    status: 'insufficient',
                    reasons: ['not-enough-months'],
                },
            }),
        });
        expect(result.mode).toBe('norms');
        expect(result.reasons).toEqual([
            'forecast-shadow-months-below-9',
            CODES.forecastBacktestInsufficient,
        ]);
    });

    it('гейт теневых месяцев берётся параметром', () => {
        const result = elevateReadiness(
            base(),
            { forecast: forecastPass({ shadowMonths: 10 }) },
            { ...AI_READINESS_STAGE_GATE_DEFAULTS, forecastShadowMonths: 12 },
        );
        expect(result.reasons).toEqual(['forecast-shadow-months-below-12']);
    });

    it('покрытие ниже цели и ошибка не ниже простых правил — обе причины', () => {
        const result = elevateReadiness(base(), {
            forecast: forecastPass({
                backtest: {
                    status: 'fail',
                    reasons: ['coverage-below', 'mase-naive', 'mase-mean3'],
                },
            }),
        });
        expect(result.mode).toBe('norms');
        expect(result.reasons).toEqual([
            CODES.forecastCoverage,
            CODES.forecastMase,
        ]);
    });

    it('провал без известной причины — не пройдено', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass({
                    backtest: { status: 'fail', reasons: [] },
                }),
            }).reasons,
        ).toEqual([CODES.forecastBacktestInsufficient]);
    });
});

describe('elevateReadiness: ступень «рекомендации» (L5)', () => {
    it('обе ступени пройдены — recommendations', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass(),
                recommendations: recommendationsPass(),
            }),
        ).toMatchObject({ mode: 'recommendations', reasons: [] });
    });

    it('советы без пройденного прогноза не поднимают режим', () => {
        const result = elevateReadiness(base(), {
            forecast: forecastPass({ stageEnabled: false }),
            recommendations: recommendationsPass(),
        });
        expect(result).toMatchObject({
            mode: 'norms',
            reasons: [
                CODES.forecastDisabled,
                CODES.recommendationsNeedsForecast,
            ],
        });
    });

    it('без ступени прогноза советы не рассматриваются', () => {
        expect(
            elevateReadiness(base(), {
                recommendations: recommendationsPass(),
            }),
        ).toMatchObject({
            mode: 'norms',
            reasons: [CODES.recommendationsNeedsForecast],
        });
    });

    it('советы не проверены и выключены — «нужен прогноз» не пишется', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass({ backtest: null }),
                recommendations: recommendationsPass({
                    stageEnabled: false,
                    effect: null,
                }),
            }).reasons,
        ).toEqual([CODES.forecastLogMissing]);
    });

    it('прогноз пройден, эффекта нет — forecast с причиной', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass(),
                recommendations: recommendationsPass({ effect: null }),
            }),
        ).toMatchObject({
            mode: 'forecast',
            reasons: [CODES.recommendationsEffectMissing],
        });
    });

    it('гейт L5 пройден, флаг выключен — forecast с причиной', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass(),
                recommendations: recommendationsPass({ stageEnabled: false }),
            }),
        ).toMatchObject({
            mode: 'forecast',
            reasons: [CODES.recommendationsDisabled],
        });
    });

    it('причины гейта эффекта — с гейтом в коде; два гейта выданных — разные коды', () => {
        const result = elevateReadiness(base(), {
            forecast: forecastPass(),
            recommendations: recommendationsPass({
                effect: {
                    status: 'insufficient',
                    reasons: [
                        'issued-below-min',
                        'issued-below-n-min',
                        'no-positive-edge',
                    ],
                    minIssued: 20,
                    minN: 8,
                },
            }),
        });
        expect(result.mode).toBe('forecast');
        // Закрытых окон меньше 20 и выданных меньше 8 (доли) — разные
        // счётчики: одна подпись «с завершённой проверкой меньше 8» врала бы.
        expect(result.reasons).toEqual([
            'recommendations-issued-below-20',
            'recommendations-shares-issued-below-8',
            CODES.recommendationsNoPositiveEdge,
        ]);
    });

    it('провальные причины L5 переводятся в коды готовности', () => {
        const result = elevateReadiness(base(), {
            forecast: forecastPass(),
            recommendations: recommendationsPass({
                effect: {
                    status: 'fail',
                    reasons: [
                        'done-share-below',
                        'disagree-above',
                        'goodhart-flags',
                    ],
                },
            }),
        });
        expect(result.reasons).toEqual([
            CODES.recommendationsDoneShare,
            CODES.recommendationsDisagree,
            CODES.recommendationsGoodhart,
        ]);
    });

    it('гейт выданных без числа в снапшоте — из реестра', () => {
        const result = elevateReadiness(base(), {
            forecast: forecastPass(),
            recommendations: recommendationsPass({
                effect: {
                    status: 'insufficient',
                    reasons: ['issued-below-min'],
                },
            }),
        });
        expect(result.reasons).toEqual([
            `recommendations-issued-below-${registryDefault('recommendations_min_issued')}`,
        ]);
    });

    it('не пройдено без известной причины — как нет оценки', () => {
        expect(
            elevateReadiness(base(), {
                forecast: forecastPass(),
                recommendations: recommendationsPass({
                    effect: { status: 'fail', reasons: [] },
                }),
            }).reasons,
        ).toEqual([CODES.recommendationsEffectMissing]);
    });
});
