import {
    AI_READINESS_GATE_DEFAULTS,
    AI_READINESS_REASON_CODES,
    buildReadiness,
    readinessReason,
    type ReadinessInput,
} from '../model/readiness';
import {
    AI_READINESS_QUALITY_REASON_CODES,
    buildWindowedReadiness,
    resolveReadinessWindow,
    type ReadinessWindowCounters,
    type WindowedReadinessInput,
} from '../model/readiness-window';

/**
 * Окно готовности (находка M9 аудита Фазы 2): период витрины ограничен
 * тремя месяцами, поэтому при живой модели портала счётчики режима берутся
 * из её окна (12 месяцев), а без модели остаются периодом.
 */
const PERIOD: ReadinessWindowCounters = {
    historyMonths: 0,
    presentations: 100,
    months: 1,
};
const MODEL: ReadinessWindowCounters = {
    historyMonths: 6,
    presentations: 420,
    months: 12,
};

/** Правила режимов без счётчиков: портал настроен, гипотезы нет. */
const rules = (
    over: Partial<Omit<ReadinessInput, 'historyMonths' | 'presentations'>> = {},
): Omit<ReadinessInput, 'historyMonths' | 'presentations'> => ({
    enabled: true,
    pipelineEnabled: true,
    sales: 12,
    comparableFrom: '2026-08-24',
    calendarImported: true,
    rosterLevels: 4,
    rosterConfirmedAt: '',
    hypothesisPairs: 0,
    betaSource: 'none',
    betaCountdown: null,
    ...over,
});

const input = (over: Partial<WindowedReadinessInput> = {}) => ({
    rules: rules(),
    period: PERIOD,
    ...over,
});

describe('resolveReadinessWindow: чем считать режим', () => {
    it('модели нет — окно остаётся периодом витрины', () => {
        expect(resolveReadinessWindow(PERIOD)).toEqual({
            ...PERIOD,
            source: 'period',
        });
        expect(resolveReadinessWindow(PERIOD, null)).toEqual({
            ...PERIOD,
            source: 'period',
        });
    });

    it('модель есть — окно её, счётчики по максимуму с периодом', () => {
        expect(resolveReadinessWindow(PERIOD, MODEL)).toEqual({
            historyMonths: 6,
            presentations: 420,
            months: 12,
            source: 'model',
        });
    });

    it('модель отстала — свежие числа периода не пропадают', () => {
        const stale: ReadinessWindowCounters = {
            historyMonths: 1,
            presentations: 12,
            months: 12,
        };

        expect(resolveReadinessWindow(PERIOD, stale)).toEqual({
            historyMonths: 1,
            presentations: 100,
            months: 12,
            source: 'model',
        });
    });

    it('пустое окно модели равнозначно её отсутствию', () => {
        const empty: ReadinessWindowCounters = {
            historyMonths: 0,
            presentations: 0,
            months: 12,
        };

        expect(resolveReadinessWindow(PERIOD, empty).source).toBe('period');
    });

    it('битые числа нагрузки деградируют до нуля', () => {
        const broken = {
            historyMonths: Number.NaN,
            presentations: -5,
        } as ReadinessWindowCounters;

        expect(resolveReadinessWindow(broken)).toEqual({
            historyMonths: 0,
            presentations: 0,
            months: 0,
            source: 'period',
        });
    });
});

describe('buildWindowedReadiness: правила режимов не дублируются', () => {
    it('месячный период при 6 месяцах модели → norms', () => {
        const result = buildWindowedReadiness(input({ model: MODEL }));
        const direct = buildReadiness({
            ...rules(),
            historyMonths: MODEL.historyMonths,
            presentations: MODEL.presentations,
        });

        expect(result.mode).toBe('norms');
        expect(result.mode).toBe(direct.mode);
        expect(result.reasons).toEqual(direct.reasons);
        expect(result.window.source).toBe('model');
    });

    it('без модели тот же период не выходит из калибровки', () => {
        const result = buildWindowedReadiness(input());

        expect(result.mode).toBe('calibration');
        expect(result.reasons).toEqual([
            readinessReason(
                AI_READINESS_REASON_CODES.historyShort,
                AI_READINESS_GATE_DEFAULTS.calibrationMonths,
            ),
        ]);
        expect(result.historyMonths).toBe(PERIOD.historyMonths);
        expect(result.window.source).toBe('period');
    });

    it('вердикт качества данных дописывает причину, режим не меняет', () => {
        const flagged = buildWindowedReadiness(
            input({ model: MODEL, dataQualityFlagged: true }),
        );
        const clean = buildWindowedReadiness(input({ model: MODEL }));

        expect(flagged.mode).toBe(clean.mode);
        expect(flagged.reasons).toEqual([
            ...clean.reasons,
            AI_READINESS_QUALITY_REASON_CODES.timestampLeak,
        ]);
    });

    it('гейты приходят параметром: свой гейт норм поднимает планку', () => {
        const result = buildWindowedReadiness(input({ model: MODEL }), {
            ...AI_READINESS_GATE_DEFAULTS,
            normsPresentations: MODEL.presentations + 1,
        });

        expect(result.mode).toBe('descriptive');
        expect(result.reasons).toEqual([
            readinessReason(
                AI_READINESS_REASON_CODES.normsPresentationsFew,
                MODEL.presentations + 1,
            ),
        ]);
    });
});
