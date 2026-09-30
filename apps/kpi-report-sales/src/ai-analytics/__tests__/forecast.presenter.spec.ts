import {
    lastForecastLogDay,
    readForecastBacktest,
} from '../domain/assembler/forecast-snapshots.reader';
import {
    type ForecastSources,
    presentForecast,
} from '../domain/presenter/forecast.presenter';

const BACKTEST = {
    status: 'pass',
    reasons: [],
    months: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
    days: 132,
    level: 0.8,
    coverage: {
        share: 0.78,
        covered: 103,
        days: 132,
        ci90: [0.72, 0.83],
        target: 0.8,
    },
    errors: { p50: 3, naive: 4, mean3: 3.5 },
    mase: {
        naive: { value: 0.75, ci90: [0.6, 0.9], draws: 500 },
        mean3: { value: null, ci90: null, draws: 0 },
        max: 1,
    },
};

const sources = (over: Partial<ForecastSources> = {}): ForecastSources => ({
    monthKey: '2026-10',
    day: {
        day: '2026-10-05',
        band: { low: 38, p50: 46, high: 55 },
        level: 0.8,
        naive: 44,
        mean3: null,
        done: 6,
        money: null,
        checkSource: 'estimated',
    },
    backtest: readForecastBacktest('2026-09', {
        monthKey: '2026-09',
        status: 'pass',
        reasons: [],
        shadowMonths: 10,
        shadowMinMonths: 9,
        backtest: BACKTEST,
    }),
    stageEnabled: true,
    shadowMinMonths: 9,
    readinessMode: 'forecast',
    ...over,
});

describe('forecast-snapshots.reader — структурное чтение журнала и проверки', () => {
    it('журнал: последний целый день по дате; битые дни пропускаются; деньги необязательны', () => {
        const day = lastForecastLogDay({
            days: [
                {
                    day: '2026-10-03',
                    low: 1,
                    p50: 2,
                    high: 3,
                    level: 0.8,
                    naive: 2,
                    done: 1,
                },
                { day: '2026-10-09', low: 'x' },
                null,
                {
                    day: '2026-10-04',
                    low: 2,
                    p50: 3,
                    high: 4,
                    level: 0.8,
                    naive: 3,
                    done: 2,
                    mean3: 2.5,
                    money: { low: 1 },
                },
            ],
        });

        expect(day).toEqual({
            day: '2026-10-04',
            band: { low: 2, p50: 3, high: 4 },
            level: 0.8,
            naive: 3,
            mean3: 2.5,
            done: 2,
            money: null,
            checkSource: null,
        });
    });

    it('журнал чужой формы или пустой — null', () => {
        expect(lastForecastLogDay(null)).toBeNull();
        expect(lastForecastLogDay({ days: 'нет' })).toBeNull();
        expect(lastForecastLogDay({ days: [] })).toBeNull();
    });

    it('проверка: числа гейта, неизвестные причины отбрасываются, без статуса — null', () => {
        const view = readForecastBacktest('2026-09', {
            status: 'fail',
            reasons: ['coverage-below', 'чужая'],
            shadowMonths: 4,
            backtest: BACKTEST,
        });

        expect(view).toEqual({
            monthKey: '2026-09',
            status: 'fail',
            reasons: ['coverage-below'],
            shadowMonths: 4,
            shadowMinMonths: null,
            numbers: {
                coverageShare: 0.78,
                coverageCi90: [0.72, 0.83],
                coverageTarget: 0.8,
                maseNaive: 0.75,
                maseMean3: null,
                maseMax: 1,
                months: 6,
                days: 132,
            },
        });
        expect(readForecastBacktest('2026-09', { status: 'магия' })).toBeNull();
        expect(
            readForecastBacktest('2026-09', { status: 'insufficient' })
                ?.numbers,
        ).toBeNull();
    });
});

describe('presentForecast — режим и причины', () => {
    it('published: вилка есть, порог теневых месяцев — из живого реестра', () => {
        const dto = presentForecast(sources());

        expect(dto.mode).toBe('published');
        expect(dto.band).toEqual({ low: 38, p50: 46, high: 55 });
        expect(dto.money).toBeNull();
        expect(dto.shadow).toEqual({
            monthsLogged: 10,
            minMonths: 9,
            backtest: {
                monthKey: '2026-09',
                status: 'pass',
                coverageShare: 0.78,
                coverageCi90: [0.72, 0.83],
                coverageTarget: 0.8,
                maseNaive: 0.75,
                maseMean3: null,
                maseMax: 1,
                months: 6,
                days: 132,
            },
        });
    });

    it('мало теневых месяцев — shadow даже при пройденной проверке и включённом флаге', () => {
        const base = sources();
        const dto = presentForecast(
            sources({
                backtest: base.backtest && {
                    ...base.backtest,
                    shadowMonths: 5,
                },
            }),
        );

        expect(dto.mode).toBe('shadow');
        expect(dto.band).toBeNull();
        expect(dto.reasons).toEqual(['forecast-shadow-months-below-9']);
    });

    it('проверка «мало данных» без причин — одна причина insufficient; проверка есть — не «не начал копиться»', () => {
        const base = sources();
        const dto = presentForecast(
            sources({
                day: null,
                backtest: base.backtest && {
                    ...base.backtest,
                    status: 'insufficient',
                    reasons: ['not-enough-months'],
                    numbers: null,
                },
            }),
        );

        expect(dto.reasons).toEqual(['forecast-backtest-insufficient']);
        expect(dto.shadow.backtest).toMatchObject({
            status: 'insufficient',
            coverageShare: null,
            coverageCi90: null,
            months: 0,
        });
    });

    it('флаг выключен: причина «выключено» только при пройденном гейте, иначе — причины гейта', () => {
        const base = sources();
        expect(
            presentForecast(sources({ stageEnabled: false })).reasons,
        ).toEqual(['forecast-stage-disabled']);

        const failing = presentForecast(
            sources({
                stageEnabled: false,
                backtest: base.backtest && {
                    ...base.backtest,
                    shadowMonths: 5,
                },
            }),
        );
        expect(failing.mode).toBe('shadow');
        expect(failing.reasons).toEqual(['forecast-shadow-months-below-9']);
    });

    it('порог изменён после заморозки: судим по живому реестру, как готовность', () => {
        const base = sources();
        const backtest = base.backtest && { ...base.backtest, shadowMonths: 7 };
        // В снапшоте проверки записан порог 9, в реестре портала уже 6.
        const lowered = presentForecast(
            sources({ backtest, shadowMinMonths: 6 }),
        );
        expect(lowered.mode).toBe('published');
        expect(lowered.shadow.minMonths).toBe(6);

        // Порог подняли до 12 — 10 теневых месяцев уже мало.
        const raised = presentForecast(sources({ shadowMinMonths: 12 }));
        expect(raised.mode).toBe('shadow');
        expect(raised.reasons).toEqual(['forecast-shadow-months-below-12']);
    });

    it('проверка пройдена, а журнала за месяц нет (1-е число, упал ночной расчёт) — published без вилки, не «ждать проверку»', () => {
        const dto = presentForecast(sources({ day: null }));

        expect(dto.mode).toBe('published');
        expect(dto.reasons).toEqual([]);
        expect(dto.band).toBeNull();
        expect(dto.money).toBeNull();
        expect(dto.asOf).toBeNull();
        expect(dto.shadow.backtest?.status).toBe('pass');
    });

    it('нет ни проверки, ни журнала — «ещё не начал копиться»', () => {
        const dto = presentForecast(sources({ day: null, backtest: null }));

        expect(dto.mode).toBe('shadow');
        expect(dto.reasons).toEqual([
            'forecast-shadow-months-below-9',
            'forecast-backtest-insufficient',
            'forecast-log-missing',
        ]);
    });

    it('базовая готовность ниже «прогноза» — shadow без вилки, как в баннере', () => {
        for (const readinessMode of [
            'descriptive',
            'calibration',
            'norms',
            'kpi-only',
        ] as const) {
            const dto = presentForecast(sources({ readinessMode }));
            expect(dto.mode).toBe('shadow');
            expect(dto.band).toBeNull();
            expect(dto.money).toBeNull();
            expect(dto.reasons).toEqual(['forecast-readiness-below']);
        }
        expect(
            presentForecast(sources({ readinessMode: 'recommendations' })).mode,
        ).toBe('published');
    });

    it('готовность не прочиталась (null) — решает гейт прогноза; флаг выключен — сначала «выключено»', () => {
        expect(presentForecast(sources({ readinessMode: null })).mode).toBe(
            'published',
        );
        expect(
            presentForecast(
                sources({ stageEnabled: false, readinessMode: 'descriptive' }),
            ).reasons,
        ).toEqual(['forecast-stage-disabled']);
    });

    it('ответ детерминирован и вход не мутируется', () => {
        const input = sources();
        const snapshot = JSON.stringify(input);
        expect(presentForecast(input)).toEqual(presentForecast(input));
        expect(JSON.stringify(input)).toBe(snapshot);
    });
});
