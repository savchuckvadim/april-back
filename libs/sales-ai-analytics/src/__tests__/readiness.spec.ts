import {
    AI_READINESS_GATE_DEFAULTS,
    AI_READINESS_REASON_CODES,
    BetaCountdown,
    ReadinessGates,
    ReadinessInput,
    buildReadiness,
    confidenceForPeriod,
    isRosterConfirmed,
    metricForPeriod,
    readinessReason,
} from '../model/readiness';
import { registryDefault } from '../params/registry.access';
import { findParam } from '../params/registry.const';

describe('AI_READINESS_GATE_DEFAULTS: гейты из реестра параметров', () => {
    it('roster_confirm_required и калибровочные гейты — дефолты реестра', () => {
        expect(AI_READINESS_GATE_DEFAULTS.rosterConfirmRequired).toBe(
            registryDefault('roster_confirm_required'),
        );
        expect(findParam('roster_confirm_required')?.defaultValue).toBe(false);
        expect(AI_READINESS_GATE_DEFAULTS.calibrationMonths).toBe(
            registryDefault('calibration_min_months'),
        );
        expect(AI_READINESS_GATE_DEFAULTS.normsPresentations).toBe(
            registryDefault('calibration_min_presentations'),
        );
        expect(AI_READINESS_GATE_DEFAULTS).toEqual({
            calibrationMonths: 3,
            calibrationPresentations: 60,
            normsPresentations: 100,
            rosterConfirmRequired: false,
        });
    });
});

/** Портал, уже прошедший калибровку: 3 мес., 100 презентаций, календарь. */
const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
    enabled: true,
    pipelineEnabled: true,
    historyMonths: 3,
    presentations: 100,
    sales: 4,
    comparableFrom: '2026-08-24',
    calendarImported: true,
    rosterLevels: 4,
    rosterConfirmedAt: '',
    hypothesisPairs: 0,
    betaSource: 'none',
    betaCountdown: null,
    ...over,
});

const gates = (over: Partial<ReadinessGates> = {}): ReadinessGates => ({
    ...AI_READINESS_GATE_DEFAULTS,
    ...over,
});

/** Счётчик в том виде, в каком его считает `model/beta-power.ts`. */
const COUNTDOWN: BetaCountdown = {
    seNow: 0.21,
    presentationsLeft: 820,
    monthsLeft: 16,
    presentationsForSe: 770,
    holdMonths: 1,
};

describe('buildReadiness: калибровочный гейт', () => {
    it('2 месяца и 120 презентаций — всё ещё calibration', () => {
        const result = buildReadiness(
            input({ historyMonths: 2, presentations: 120 }),
        );

        expect(result.mode).toBe('calibration');
        expect(result.reasons).toEqual([
            readinessReason(AI_READINESS_REASON_CODES.historyShort, 3),
        ]);
    });

    it('3 месяца и 59 презентаций — calibration по презентациям', () => {
        const result = buildReadiness(
            input({ historyMonths: 3, presentations: 59 }),
        );

        expect(result.mode).toBe('calibration');
        expect(result.reasons).toEqual([
            readinessReason(AI_READINESS_REASON_CODES.presentationsFew, 60),
        ]);
    });

    it('аналитика включена, но разборов нет — kpi-only без счётчика', () => {
        const result = buildReadiness(
            input({ pipelineEnabled: false, betaCountdown: COUNTDOWN }),
        );

        expect(result.mode).toBe('kpi-only');
        expect(result.reasons).toEqual([AI_READINESS_REASON_CODES.kpiOnly]);
        expect(result.betaCountdown).toBeNull();
    });
});

describe('buildReadiness: подъём до norms', () => {
    it('3 месяца и 100 презентаций без календаря — descriptive с причиной', () => {
        const result = buildReadiness(input({ calendarImported: false }));

        expect(result.mode).toBe('descriptive');
        expect(result.reasons).toContain(
            AI_READINESS_REASON_CODES.calendarMissing,
        );
    });

    it('roster_confirm_required = false и непустые уровни — norms без даты', () => {
        const result = buildReadiness(
            input({ rosterLevels: 4, rosterConfirmedAt: '' }),
            gates({ rosterConfirmRequired: false }),
        );

        expect(result.mode).toBe('norms');
        expect(result.reasons).toEqual([]);
    });

    it('roster_confirm_required = true и пустая дата — descriptive', () => {
        const result = buildReadiness(
            input({ rosterLevels: 4, rosterConfirmedAt: '' }),
            gates({ rosterConfirmRequired: true }),
        );

        expect(result.mode).toBe('descriptive');
        expect(result.reasons).toEqual([
            AI_READINESS_REASON_CODES.rosterNotConfirmed,
        ]);
    });

    it('roster_confirm_required = true и дата подтверждения — norms', () => {
        const result = buildReadiness(
            input({ rosterConfirmedAt: '2026-09-01' }),
            gates({ rosterConfirmRequired: true }),
        );

        expect(result.mode).toBe('norms');
    });

    it('пустой ростер не подтверждён даже без требования даты', () => {
        expect(
            isRosterConfirmed({ rosterLevels: 0, rosterConfirmedAt: '' }),
        ).toBe(false);
        expect(
            isRosterConfirmed({ rosterLevels: 2, rosterConfirmedAt: '' }),
        ).toBe(true);
    });

    it('менее 100 презентаций — descriptive по гейту L2', () => {
        const result = buildReadiness(input({ presentations: 80 }));

        expect(result.mode).toBe('descriptive');
        expect(result.reasons).toEqual([
            readinessReason(
                AI_READINESS_REASON_CODES.normsPresentationsFew,
                100,
            ),
        ]);
    });
});

describe('buildReadiness: кап §5.4 — без снапшота модели портала', () => {
    it('гейты норм пройдены, модели нет → descriptive с причиной no-portal-model', () => {
        const result = buildReadiness(input({ portalModelPresent: false }));

        expect(result.mode).toBe('descriptive');
        expect(result.reasons).toEqual([
            AI_READINESS_REASON_CODES.modelMissing,
        ]);
        expect(AI_READINESS_REASON_CODES.modelMissing).toBe('no-portal-model');
        expect(result.betaSource).toBe('none');
    });

    it('модель есть (true) или признак не передан — прежняя лестница до norms', () => {
        expect(buildReadiness(input({ portalModelPresent: true })).mode).toBe(
            'norms',
        );
        expect(buildReadiness(input()).mode).toBe('norms');
    });

    it('кап не отменяет гипотезу выше norms: без модели hypothesis недостижим', () => {
        const result = buildReadiness(
            input({
                portalModelPresent: false,
                betaSource: 'hypothesis',
                hypothesisPairs: 2,
            }),
        );

        expect(result.mode).toBe('descriptive');
        expect(result.betaSource).toBe('none');
        expect(result.reasons).toEqual([
            AI_READINESS_REASON_CODES.modelMissing,
        ]);
    });

    it('причины гейтов идут первыми, кап — последним', () => {
        const result = buildReadiness(
            input({ portalModelPresent: false, presentations: 80 }),
        );

        expect(result.mode).toBe('descriptive');
        expect(result.reasons).toEqual([
            readinessReason(
                AI_READINESS_REASON_CODES.normsPresentationsFew,
                100,
            ),
            AI_READINESS_REASON_CODES.modelMissing,
        ]);
    });

    it('ниже descriptive кап не виден: calibration остаётся со своими причинами', () => {
        const result = buildReadiness(
            input({ portalModelPresent: false, historyMonths: 2 }),
        );

        expect(result.mode).toBe('calibration');
        expect(result.reasons).toEqual([
            readinessReason(AI_READINESS_REASON_CODES.historyShort, 3),
        ]);
    });

    it('счётчик до гейта β при капе не гаснет', () => {
        const result = buildReadiness(
            input({ portalModelPresent: false, betaCountdown: COUNTDOWN }),
        );

        expect(result.mode).toBe('descriptive');
        expect(result.betaCountdown).toEqual(COUNTDOWN);
    });
});

describe('buildReadiness: режим hypothesis', () => {
    it('гипотеза с двумя парами при norms — hypothesis', () => {
        const result = buildReadiness(
            input({ betaSource: 'hypothesis', hypothesisPairs: 2 }),
        );

        expect(result.mode).toBe('hypothesis');
        expect(result.betaSource).toBe('hypothesis');
    });

    it('одна пара — режим не поднимается выше norms', () => {
        const result = buildReadiness(
            input({ betaSource: 'hypothesis', hypothesisPairs: 1 }),
        );

        expect(result.mode).toBe('norms');
        expect(result.betaSource).toBe('none');
        expect(result.reasons).toEqual([
            AI_READINESS_REASON_CODES.hypothesisMissing,
        ]);
    });

    it('гипотеза без норм (нет календаря) — descriptive', () => {
        const result = buildReadiness(
            input({
                betaSource: 'hypothesis',
                hypothesisPairs: 3,
                calendarImported: false,
            }),
        );

        expect(result.mode).toBe('descriptive');
        expect(result.betaSource).toBe('none');
    });
});

describe('buildReadiness: счётчик до гейта β (решение А.3)', () => {
    it('приходит уже при descriptive', () => {
        const result = buildReadiness(
            input({ calendarImported: false, betaCountdown: COUNTDOWN }),
        );

        expect(result.mode).toBe('descriptive');
        expect(result.betaCountdown).toEqual(COUNTDOWN);
    });

    it('показывается с первого дня — уже в calibration', () => {
        const result = buildReadiness(
            input({
                historyMonths: 0,
                presentations: 0,
                betaCountdown: COUNTDOWN,
            }),
        );

        expect(result.mode).toBe('calibration');
        expect(result.betaCountdown).toEqual(COUNTDOWN);
    });

    it('null при betaSource = data — гейт уже пройден', () => {
        const result = buildReadiness(
            input({ betaSource: 'data', betaCountdown: COUNTDOWN }),
        );

        expect(result.betaSource).toBe('data');
        expect(result.betaCountdown).toBeNull();
    });
});

describe('confidenceForPeriod и metricForPeriod', () => {
    it('период до comparableFrom — доверие none с version-changed', () => {
        const confidence = confidenceForPeriod(
            120,
            'rate',
            '2026-07-01',
            '2026-08-24',
        );

        expect(confidence).toEqual({
            level: 'none',
            reason: 'version-changed',
        });
    });

    it('период после comparableFrom считается по объёму', () => {
        expect(
            confidenceForPeriod(120, 'rate', '2026-09-01', '2026-08-24').level,
        ).toBe('ok');
    });

    it('без comparableFrom ряд не рвётся', () => {
        expect(confidenceForPeriod(50, 'score', '2020-01-01', '').level).toBe(
            'ok',
        );
    });

    it('n < 8 — значение наружу не уходит', () => {
        const metric = metricForPeriod(4.2, 7, 'score', '2026-09-01', '');

        expect(metric.value).toBeNull();
        expect(metric.confidence).toEqual({
            level: 'none',
            reason: 'not-enough-data',
        });
    });

    it('разорванный ряд тоже прячет значение', () => {
        const metric = metricForPeriod(
            0.42,
            300,
            'rate',
            '2026-07-01',
            '2026-08-24',
        );

        expect(metric.value).toBeNull();
        expect(metric.n).toBe(300);
    });
});
