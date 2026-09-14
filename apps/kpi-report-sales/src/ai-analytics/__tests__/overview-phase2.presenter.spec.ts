import type { PortalModelView } from '../domain/assembler/overview-model.types';
import {
    buildOverviewReadiness,
    modelDataQualityFlagged,
    modelReadinessWindow,
} from '../domain/presenter/overview-phase2.presenter';
import { READINESS_REASONS } from '../domain/presenter/readiness.util';
import {
    AI_SANITY_DATA_QUALITY,
    AI_SANITY_RULES,
    type AiSanityReport,
} from '../steps/sanity.types';
import type { AiManagerLevelRecord } from '../store/ai-analytics-settings.store';
import { portalModel } from './fixtures/norms.fixture';
import {
    callsOf,
    overviewSources,
    OVERVIEW_NOW,
} from './fixtures/overview.fixture';

/**
 * Готовность витрины обзора поверх снапшотов Фазы 2 (находка M9 аудита):
 * период обзора ограничен тремя месяцами, поэтому окно готовности берётся
 * из месячной модели портала (12 месяцев), а вердикт её санити-панели
 * доезжает до причин DTO.
 */
const MANAGER_ID = 10;

/** Санити-отчёт модели с вердиктом качества данных. */
function sanityReport(flagged: boolean): AiSanityReport {
    return {
        day: '2026-09-01',
        weekKey: '2026-W36',
        generatedAt: '2026-09-01T01:00:00Z',
        rules: [],
        warnings: [],
        readiness: {
            dataQuality: flagged
                ? AI_SANITY_DATA_QUALITY.flagged
                : AI_SANITY_DATA_QUALITY.ok,
            timestampLeak: {
                n: 40,
                leaked: flagged ? 6 : 0,
                sharePct: flagged ? 15 : 0,
                maxPct: 0.05,
                flagged,
            },
            warningRules: flagged ? [AI_SANITY_RULES.timestampLeak] : [],
        },
    };
}

/** Модель портала с окном готовности 12 месяцев и санити-отчётом. */
function modelWith(
    readiness: { historyMonths: number; presentations: number },
    flagged = false,
): PortalModelView {
    return portalModel({
        window: [
            '2025-10',
            '2025-11',
            '2025-12',
            '2026-01',
            '2026-02',
            '2026-03',
            '2026-04',
            '2026-05',
            '2026-06',
            '2026-07',
            '2026-08',
            '2026-09',
        ],
        readiness: {
            mode: 'norms',
            historyMonths: readiness.historyMonths,
            presentations: readiness.presentations,
            sales: 31,
            comparableFrom: '',
            reasons: [],
        },
        sanity: sanityReport(flagged),
    });
}

/** Источники обзора портала, прошедшего настройку: календарь и состав. */
function sources(overrides: Parameters<typeof overviewSources>[2] = {}) {
    return overviewSources(callsOf(String(MANAGER_ID), 10), [MANAGER_ID], {
        calendar: {
            timeZone: 'Europe/Moscow',
            holidays: ['2026-01-01'],
            workweek: [1, 2, 3, 4, 5],
        },
        levels: new Map<number, AiManagerLevelRecord>([
            [
                MANAGER_ID,
                { managerId: MANAGER_ID, level: 'middle', since: null },
            ],
        ]),
        ...overrides,
    });
}

describe('окно готовности из модели портала', () => {
    it('читается структурно: счётчики и ширина окна', () => {
        const window = modelReadinessWindow(
            modelWith({ historyMonths: 6, presentations: 420 }),
        );

        expect(window).toEqual({
            historyMonths: 6,
            presentations: 420,
            months: 12,
        });
    });

    it('модели нет — окна нет', () => {
        expect(modelReadinessWindow(null)).toBeNull();
        expect(modelReadinessWindow(undefined)).toBeNull();
    });

    it('нагрузка неполная — счётчики нулевые, а не выдуманные', () => {
        expect(modelReadinessWindow(portalModel())).toEqual({
            historyMonths: 0,
            presentations: 0,
            months: 0,
        });
    });
});

describe('вердикт качества данных модели', () => {
    it('flagged санити-панели — да, ok и отсутствие отчёта — нет', () => {
        expect(
            modelDataQualityFlagged(
                modelWith({ historyMonths: 6, presentations: 420 }, true),
            ),
        ).toBe(true);
        expect(
            modelDataQualityFlagged(
                modelWith({ historyMonths: 6, presentations: 420 }),
            ),
        ).toBe(false);
        expect(modelDataQualityFlagged(portalModel())).toBe(false);
        expect(modelDataQualityFlagged(null)).toBe(false);
    });
});

describe('buildOverviewReadiness: период витрины против окна модели', () => {
    it('месячный период при 6 месяцах истории модели → norms', () => {
        const readiness = buildOverviewReadiness(
            sources({
                snapshots: {
                    model: modelWith({ historyMonths: 6, presentations: 420 }),
                },
            }),
            OVERVIEW_NOW,
        );

        expect(readiness.historyMonths).toBe(6);
        expect(readiness.presentations).toBe(420);
        expect(readiness.mode).toBe('norms');
        expect(readiness.reasons).toEqual([]);
    });

    it('снапшота модели нет — прежнее поведение по периоду', () => {
        const readiness = buildOverviewReadiness(sources(), OVERVIEW_NOW);

        expect(readiness.historyMonths).toBe(0);
        expect(readiness.presentations).toBe(10);
        expect(readiness.mode).toBe('calibration');
        expect(readiness.reasons).toContain(READINESS_REASONS.historyShort);
    });

    it('санити-панель пометила метки времени → причина в DTO', () => {
        const readiness = buildOverviewReadiness(
            sources({
                snapshots: {
                    model: modelWith(
                        { historyMonths: 6, presentations: 420 },
                        true,
                    ),
                },
            }),
            OVERVIEW_NOW,
        );

        expect(readiness.mode).toBe('norms');
        expect(readiness.reasons).toEqual([READINESS_REASONS.timestampLeak]);
    });
});
