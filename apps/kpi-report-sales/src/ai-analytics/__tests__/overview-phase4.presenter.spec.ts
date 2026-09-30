import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import type {
    OverviewSources,
    PortalModelView,
} from '../domain/assembler/overview-model.types';
import {
    buildOverviewReadiness,
    modelReadinessOptions,
} from '../domain/presenter/overview-phase2.presenter';
import {
    modelReadinessStages,
    portalRegistryOf,
    stageFlagsOf,
    stagesFromSources,
} from '../domain/presenter/readiness-stages.util';
import { hasCallDate } from '../domain/loaders/lite-row.mapper';
import { liteRow, portalSettings } from './fixtures/lite-row.fixture';
import {
    backtestSnapshot,
    effectSnapshot,
} from './fixtures/phase4-snapshots.fixture';
import { recomputeModel } from './fixtures/recompute.fixture';

/**
 * Витрина Фазы 4 (обзор и /settings): источник календаря из модели
 * портала (хвост 1: нет поля в старом снапшоте — прежний расчёт по
 * праздникам), снимок ступеней L4/L5 из модели и свежие снапшоты ступеней
 * с флагами портала поверх него.
 */
const NOW = new Date('2026-10-05T09:00:00Z');

const model = (over: Partial<PortalModelView> = {}): PortalModelView => ({
    ...recomputeModel(),
    ...over,
});

const FORECAST_STAGE = {
    stageEnabled: true,
    shadowMonths: 10,
    backtest: { status: 'pass' as const, reasons: [] },
};

describe('modelReadinessOptions: календарь и ступени из модели', () => {
    it('старый снапшот без источника — поля не задаются', () => {
        const options = modelReadinessOptions(model());
        expect('calendarImported' in options).toBe(false);
        expect('stages' in options).toBe(false);
    });

    it('источник календаря есть — импорт всё, кроме запасного', () => {
        const readiness = recomputeModel().readiness;
        expect(
            modelReadinessOptions(
                model({
                    readiness: { ...readiness, calendarSource: 'import' },
                }),
            ).calendarImported,
        ).toBe(true);
        expect(
            modelReadinessOptions(
                model({
                    readiness: { ...readiness, calendarSource: 'fallback' },
                }),
            ).calendarImported,
        ).toBe(false);
    });

    it('гейты ступеней модели идут в витрину: порог портала, а не дефолт', () => {
        // Портал снизил гейт теневых месяцев до 6: модель на 7 месяцах —
        // в режиме forecast; витрина по снимку обязана судить так же.
        const snapshot = model({
            readinessStages: {
                forecast: { ...FORECAST_STAGE, shadowMonths: 7 },
                recommendations: null,
            },
            readinessStageGates: {
                forecastShadowMonths: 6,
                recommendationsMinIssued: 30,
                recommendationsMinN: 10,
            },
        });
        const options = modelReadinessOptions(snapshot);
        expect(options.stageGates?.forecastShadowMonths).toBe(6);
        expect(
            modelReadinessOptions(
                model({
                    readinessStageGates: { forecastShadowMonths: 'x' } as never,
                }),
            ).stageGates,
        ).toBeUndefined();
    });

    it('снимок ступеней модели читается структурно', () => {
        expect(
            modelReadinessStages(
                model({
                    readinessStages: {
                        forecast: FORECAST_STAGE,
                        recommendations: null,
                    },
                }),
            ),
        ).toEqual({ forecast: FORECAST_STAGE, recommendations: null });
        expect(
            modelReadinessStages({
                readinessStages: { forecast: { stageEnabled: 'да' } },
            } as never),
        ).toBeNull();
        expect(
            modelReadinessStages({
                readinessStages: {
                    forecast: { ...FORECAST_STAGE, backtest: { status: 'x' } },
                },
            } as never),
        ).toBeNull();
        expect(modelReadinessStages(null)).toBeNull();
    });
});

describe('ступени из свежих снапшотов и флагов портала', () => {
    it('ни снапшотов, ни флагов — ступеней нет', () => {
        expect(
            stagesFromSources({
                snapshots: {
                    forecastBacktest: null,
                    recommendationEffect: null,
                },
                flags: { forecast: false, recommendations: false },
            }),
        ).toBeNull();
    });

    it('снапшоты есть — ступени с флагами и гейтами из снапшота', () => {
        expect(
            stagesFromSources({
                snapshots: {
                    forecastBacktest: backtestSnapshot(),
                    recommendationEffect: effectSnapshot(),
                },
                flags: { forecast: true, recommendations: false },
            }),
        ).toEqual({
            forecast: FORECAST_STAGE,
            recommendations: {
                stageEnabled: false,
                effect: { status: 'pass', reasons: [], minIssued: 20, minN: 8 },
            },
        });
    });

    it('флаги — из параметров модели портала (слой портала реестра)', () => {
        const settings = portalSettings({
            modelParams: { forecast_stage_enabled: true },
        } as never);
        expect(portalRegistryOf(settings).portal).toMatchObject({
            forecast_stage_enabled: true,
        });
        expect(stageFlagsOf(settings)).toEqual({
            forecast: true,
            recommendations: false,
        });
        expect(stageFlagsOf(portalSettings())).toEqual({
            forecast: false,
            recommendations: false,
        });
    });
});

describe('buildOverviewReadiness: ступени поверх лестницы', () => {
    const sources = (snapshotModel: PortalModelView): OverviewSources =>
        ({
            rows: [
                liteRow({
                    transcriptionId: 'p1',
                    callType: 'presentation',
                    callStartedAt: new Date('2026-10-01T09:00:00Z'),
                }),
            ].filter(hasCallDate),
            enabled: true,
            finance: { managers: [] },
            calendar: { ...DEFAULT_WORK_CALENDAR, holidays: ['2026-01-01'] },
            levels: new Map([[1, {}]]),
            rosterConfirmedAt: '',
            hypothesisPairs: 0,
            snapshots: { model: snapshotModel },
        }) as never;

    const normsModel = model({
        readiness: {
            ...recomputeModel().readiness,
            historyMonths: 12,
            presentations: 400,
        },
        readinessStages: {
            forecast: { ...FORECAST_STAGE, stageEnabled: false },
        },
    });

    it('без свежих снапшотов — снимок ступеней модели', () => {
        const readiness = buildOverviewReadiness(sources(normsModel), NOW);
        expect(readiness.mode).toBe('norms');
        expect(readiness.reasons).toContain('forecast-stage-disabled');
    });

    it('свежие снапшоты с включённым флагом важнее снимка модели', () => {
        const readiness = buildOverviewReadiness(sources(normsModel), NOW, {
            snapshots: {
                forecastBacktest: backtestSnapshot(),
                recommendationEffect: null,
            },
            flags: { forecast: true, recommendations: false },
        });
        expect(readiness.mode).toBe('forecast');
    });
});
