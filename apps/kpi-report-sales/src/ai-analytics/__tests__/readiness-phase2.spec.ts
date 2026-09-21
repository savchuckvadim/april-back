import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    buildReadiness as buildReadinessRules,
    resolveReadinessWindow,
    type BetaCountdown,
    type ReadinessInput,
    type ReadinessWindowCounters,
} from '@lib/sales-ai-analytics';
import { hasCallDate } from '../domain/loaders/lite-row.mapper';
import {
    buildReadiness,
    readinessCounters,
    READINESS_REASONS,
    resolveReadinessSales,
    type ReadinessOptions,
} from '../domain/presenter/readiness.util';
import { liteRow } from './fixtures/lite-row.fixture';

const NOW = new Date('2026-09-09T09:00:00Z');
const DAY = 86_400_000;

/** count разборанных презентаций, самая ранняя — daysAgo дней назад. */
function presentations(count: number, daysAgo: number) {
    return Array.from({ length: count }, (_, index) =>
        liteRow({
            transcriptionId: `p${daysAgo}-${index}`,
            callType: 'presentation',
            callStartedAt: new Date(
                NOW.getTime() - (daysAgo - (index % 5)) * DAY,
            ),
        }),
    ).filter(hasCallDate);
}

const countdown: BetaCountdown = {
    seNow: 0.19,
    presentationsLeft: 340,
    monthsLeft: 7,
    presentationsForSe: 400,
    holdMonths: 1,
};

/** Наружу уходит только «сколько осталось», без внутренностей гейта. */
const countdownDto = {
    seNow: 0.19,
    presentationsLeft: 340,
    monthsLeft: 7,
};

/**
 * Портал, прошедший калибровку: состав задан, календарь импортирован,
 * модель портала посчитана (кап §5.4 снимается явным признаком; окно
 * счётчиков при этом остаётся периодом — см. блок «окно готовности»).
 */
const ready = (extra: Partial<ReadinessOptions> = {}): ReadinessOptions => ({
    now: NOW,
    enabled: true,
    pipelineEnabled: true,
    calendarImported: true,
    rosterLevels: 2,
    portalModelPresent: true,
    ...extra,
});

describe('готовность витрины Фазы 2', () => {
    it('3 месяца и 100 презентаций при посчитанной модели → режим norms', () => {
        const rows = presentations(100, 95);
        const readiness = buildReadiness(rows, ready());

        expect(readiness.historyMonths).toBeGreaterThanOrEqual(3);
        expect(readiness.presentations).toBe(100);
        expect(readiness.mode).toBe('norms');
        expect(readiness.reasons).toEqual([]);
    });

    it('те же 3 месяца и 100 презентаций без модели → descriptive с no-portal-model (§5.4)', () => {
        const readiness = buildReadiness(
            presentations(100, 95),
            ready({ portalModelPresent: false }),
        );

        expect(readiness.mode).toBe('descriptive');
        expect(readiness.reasons).toEqual([READINESS_REASONS.modelMissing]);
        expect(READINESS_REASONS.modelMissing).toBe('no-portal-model');
    });

    it('презентаций меньше гейта норм → descriptive с причиной', () => {
        const readiness = buildReadiness(presentations(70, 95), ready());

        expect(readiness.mode).toBe('descriptive');
        expect(readiness.reasons).toContain(
            READINESS_REASONS.normsPresentationsFew,
        );
    });

    it('состав не подтверждён → режим норм недостижим', () => {
        const readiness = buildReadiness(
            presentations(100, 95),
            ready({ rosterLevels: 0 }),
        );

        expect(readiness.mode).toBe('descriptive');
        expect(readiness.reasons).toContain(
            READINESS_REASONS.rosterNotConfirmed,
        );
    });

    it('счётчик до гейта β приходит в DTO с первого дня', () => {
        const withCountdown = buildReadiness(
            presentations(10, 20),
            ready({ betaCountdown: countdown }),
        );
        const descriptive = buildReadiness(
            presentations(70, 95),
            ready({ betaCountdown: countdown }),
        );
        const kpiOnly = buildReadiness(
            [],
            ready({ pipelineEnabled: false, betaCountdown: countdown }),
        );

        expect(withCountdown.mode).toBe('calibration');
        expect(withCountdown.betaCountdown).toEqual(countdownDto);
        expect(descriptive.betaCountdown).toEqual(countdownDto);
        expect(descriptive.betaSource).toBe('none');
        expect(kpiOnly.mode).toBe('kpi-only');
        expect(kpiOnly.betaCountdown).toBeNull();
    });

    it('гейт β пройден (betaSource data) → счётчик гаснет', () => {
        const readiness = buildReadiness(
            presentations(100, 95),
            ready({ betaSource: 'data', betaCountdown: countdown }),
        );

        expect(readiness.betaSource).toBe('data');
        expect(readiness.betaCountdown).toBeNull();
    });

    it('гипотеза портала задана → режим hypothesis', () => {
        const readiness = buildReadiness(
            presentations(100, 95),
            ready({ betaSource: 'hypothesis', hypothesisPairs: 2 }),
        );

        expect(readiness.mode).toBe('hypothesis');
        expect(readiness.betaSource).toBe('hypothesis');
    });
});

/**
 * Находка M9 аудита: период обзора ограничен тремя месяцами
 * (`AI_ANALYTICS_OVERVIEW_MAX_MONTHS`), поэтому на обычном месячном
 * периоде режим `norms` по строкам периода недостижим в принципе — окно
 * готовности обязано приходить из модели портала (12 месяцев).
 */
describe('окно готовности: модель портала против периода витрины', () => {
    /** Месяц строк витрины: 100 разборов, самый ранний 25 дней назад. */
    const monthRows = presentations(100, 25);
    /** Окно модели портала: 6 месяцев истории и 420 презентаций. */
    const modelWindow: ReadinessWindowCounters = {
        historyMonths: 6,
        presentations: 420,
        months: 12,
    };

    it('период 1 месяц при 6 месяцах истории в модели → norms', () => {
        const readiness = buildReadiness(monthRows, ready({ modelWindow }));
        // Период сам по себе не дотягивает даже до конца калибровки.
        const periodCounters = readinessCounters(monthRows, NOW);

        expect(periodCounters.historyMonths).toBe(0);
        expect(readiness.historyMonths).toBe(modelWindow.historyMonths);
        expect(readiness.presentations).toBe(modelWindow.presentations);
        expect(readiness.mode).toBe('norms');
        expect(readiness.reasons).toEqual([]);
    });

    it('без модели и период 1 месяц → режим по гейту периода', () => {
        const readiness = buildReadiness(
            monthRows,
            ready({ portalModelPresent: false }),
        );

        // Гейт истории (3 мес.) не пройден: режим ниже norms, причина —
        // код гейта библиотеки, а не своя строка адаптера; кап §5.4 ниже
        // descriptive не показывается.
        expect(readiness.mode).toBe('calibration');
        expect(readiness.reasons).toEqual([READINESS_REASONS.historyShort]);
        expect(readiness.historyMonths).toBe(0);
        expect(readiness.presentations).toBe(100);
    });

    it('признак модели не задан — выводится из окна: без окна режим капится (§5.4)', () => {
        const readiness = buildReadiness(
            presentations(100, 95),
            ready({ portalModelPresent: undefined }),
        );
        const withWindow = buildReadiness(
            presentations(100, 95),
            ready({ portalModelPresent: undefined, modelWindow }),
        );

        expect(readiness.mode).toBe('descriptive');
        expect(readiness.reasons).toEqual([READINESS_REASONS.modelMissing]);
        expect(withWindow.mode).toBe('norms');
    });

    it('модель отстала от периода → счётчики не пропадают', () => {
        const readiness = buildReadiness(
            presentations(100, 95),
            ready({
                modelWindow: {
                    historyMonths: 1,
                    presentations: 12,
                    months: 12,
                },
            }),
        );
        const period = readinessCounters(presentations(100, 95), NOW);

        expect(readiness.historyMonths).toBe(period.historyMonths);
        expect(readiness.presentations).toBe(100);
    });

    it('пустое окно модели равнозначно её отсутствию', () => {
        const empty = buildReadiness(
            monthRows,
            ready({
                modelWindow: {
                    historyMonths: 0,
                    presentations: 0,
                    months: 12,
                },
            }),
        );
        const none = buildReadiness(monthRows, ready());

        expect(empty).toEqual(none);
    });
});

describe('качество данных модели портала в причинах DTO', () => {
    it('dataQuality = flagged → причина «протечка меток времени»', () => {
        const flagged = buildReadiness(
            presentations(100, 95),
            ready({ dataQualityFlagged: true }),
        );
        const clean = buildReadiness(presentations(100, 95), ready());

        expect(flagged.reasons).toContain(READINESS_REASONS.timestampLeak);
        // Вердикт качества данных — причина, а не гейт: режим тот же.
        expect(flagged.mode).toBe(clean.mode);
        expect(clean.reasons).not.toContain(READINESS_REASONS.timestampLeak);
    });

    it('причина дописывается к причинам гейтов, а не вместо них', () => {
        const readiness = buildReadiness(
            presentations(70, 95),
            ready({ dataQualityFlagged: true }),
        );

        expect(readiness.reasons).toEqual([
            READINESS_REASONS.normsPresentationsFew,
            READINESS_REASONS.timestampLeak,
        ]);
    });
});

describe('продажи окна готовности', () => {
    it('считаются из финансов, а при пустых финансах — из эпизодов', () => {
        expect(resolveReadinessSales(12, 9)).toBe(12);
        expect(resolveReadinessSales(0, 9)).toBe(9);
        expect(resolveReadinessSales(0, 0)).toBe(0);
        expect(resolveReadinessSales(-3, -5)).toBe(0);
    });

    it('доезжают до DTO', () => {
        const fromFinance = buildReadiness(
            presentations(10, 20),
            ready({ financeSales: 12, episodeSales: 9 }),
        );
        const fromEpisodes = buildReadiness(
            presentations(10, 20),
            ready({ financeSales: 0, episodeSales: 9 }),
        );

        expect(fromFinance.sales).toBe(12);
        expect(fromEpisodes.sales).toBe(9);
    });

    it('заглушки «продажи не считаются» нет ни в адаптере, ни в презентере', () => {
        const sources = [
            'domain/presenter/readiness.util.ts',
            'domain/presenter/overview.presenter.ts',
        ].map(file => readFileSync(join(__dirname, '..', file), 'utf8'));

        for (const source of sources) {
            expect(source).not.toContain('sales-not-computed-in-phase-1a');
        }
    });
});

describe('адаптер приложения не держит своих правил режимов', () => {
    /** Шесть фикстур: kpi-only, calibration, descriptive ×2, norms, hypothesis. */
    const fixtures: {
        name: string;
        rows: ReturnType<typeof presentations>;
        options: ReadinessOptions;
    }[] = [
        {
            name: 'kpi-only',
            rows: [],
            options: ready({ pipelineEnabled: false }),
        },
        {
            name: 'calibration',
            rows: presentations(10, 20),
            options: ready(),
        },
        {
            name: 'descriptive: мало презентаций',
            rows: presentations(70, 95),
            options: ready(),
        },
        {
            name: 'descriptive: календарь не импортирован',
            rows: presentations(100, 95),
            options: ready({ calendarImported: false }),
        },
        { name: 'norms', rows: presentations(100, 95), options: ready() },
        {
            name: 'descriptive: кап без модели портала (§5.4)',
            rows: presentations(100, 95),
            options: ready({ portalModelPresent: false }),
        },
        {
            name: 'hypothesis',
            rows: presentations(100, 95),
            options: ready({
                betaSource: 'hypothesis',
                hypothesisPairs: 2,
            }),
        },
        {
            name: 'norms по окну модели при месячном периоде',
            rows: presentations(100, 25),
            options: ready({
                modelWindow: {
                    historyMonths: 6,
                    presentations: 420,
                    months: 12,
                },
            }),
        },
    ];

    it.each(fixtures)(
        'режим совпадает с библиотечным: $name',
        ({ rows, options }) => {
            // Окно выбирает та же функция библиотеки, что и адаптер:
            // своих правил «период или модель» у приложения нет.
            const counters = resolveReadinessWindow(
                readinessCounters(rows, options.now),
                options.modelWindow ?? null,
            );
            const input: ReadinessInput = {
                enabled: options.enabled,
                pipelineEnabled: options.pipelineEnabled,
                historyMonths: counters.historyMonths,
                presentations: counters.presentations,
                sales: 0,
                comparableFrom: '',
                calendarImported: options.calendarImported ?? true,
                rosterLevels: options.rosterLevels ?? 0,
                rosterConfirmedAt: options.rosterConfirmedAt ?? '',
                hypothesisPairs: options.hypothesisPairs ?? 0,
                betaSource: options.betaSource ?? 'none',
                betaCountdown: options.betaCountdown ?? null,
                portalModelPresent:
                    options.portalModelPresent ??
                    (options.modelWindow !== null &&
                        options.modelWindow !== undefined),
            };
            const app = buildReadiness(rows, options);
            const lib = buildReadinessRules(input);

            expect(app.mode).toBe(lib.mode);
            expect(app.reasons).toEqual(lib.reasons);
            expect(app.betaSource).toBe(lib.betaSource);
        },
    );
});
