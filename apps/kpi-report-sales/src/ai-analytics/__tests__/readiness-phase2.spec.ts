import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    buildReadiness as buildReadinessRules,
    type BetaCountdown,
    type ReadinessInput,
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

/** Портал, прошедший калибровку: состав задан, календарь импортирован. */
const ready = (extra: Partial<ReadinessOptions> = {}): ReadinessOptions => ({
    now: NOW,
    enabled: true,
    pipelineEnabled: true,
    calendarImported: true,
    rosterLevels: 2,
    ...extra,
});

describe('готовность витрины Фазы 2', () => {
    it('3 месяца и 100 презентаций → режим norms', () => {
        const rows = presentations(100, 95);
        const readiness = buildReadiness(rows, ready());

        expect(readiness.historyMonths).toBeGreaterThanOrEqual(3);
        expect(readiness.presentations).toBe(100);
        expect(readiness.mode).toBe('norms');
        expect(readiness.reasons).toEqual([]);
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
            name: 'hypothesis',
            rows: presentations(100, 95),
            options: ready({
                betaSource: 'hypothesis',
                hypothesisPairs: 2,
            }),
        },
    ];

    it.each(fixtures)(
        'режим совпадает с библиотечным: $name',
        ({ rows, options }) => {
            const counters = readinessCounters(rows, options.now);
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
            };
            const app = buildReadiness(rows, options);
            const lib = buildReadinessRules(input);

            expect(app.mode).toBe(lib.mode);
            expect(app.reasons).toEqual(lib.reasons);
            expect(app.betaSource).toBe(lib.betaSource);
        },
    );
});
