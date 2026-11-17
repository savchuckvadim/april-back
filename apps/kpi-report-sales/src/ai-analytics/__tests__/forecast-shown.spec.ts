import { readForecastBacktest } from '../domain/assembler/forecast-snapshots.reader';
import {
    type ForecastSources,
    presentForecast,
} from '../domain/presenter/forecast.presenter';
import { betterSimpleForecast } from '../domain/presenter/forecast-shown.util';

interface BacktestOptions {
    status?: 'pass' | 'fail' | 'insufficient';
    reasons?: string[];
    maseNaive?: number | null;
    maseMean3?: number | null;
    shadowMonths?: number;
    /** false — проверка без чисел (журналов с фактом нет). */
    withNumbers?: boolean;
    /** Метод проверки; null — записи без поля (до 18.11.2026). */
    method?: 'presentations-v2' | null;
    otherMethodMonths?: number;
}

const backtestOf = (options: BacktestOptions = {}) =>
    readForecastBacktest('2026-09', {
        monthKey: '2026-09',
        status: options.status ?? 'pass',
        reasons: options.reasons ?? [],
        shadowMonths: options.shadowMonths ?? 10,
        shadowMinMonths: 9,
        ...(options.method === null
            ? {}
            : { method: options.method ?? 'presentations-v2' }),
        ...(options.otherMethodMonths === undefined
            ? {}
            : { otherMethodMonths: options.otherMethodMonths }),
        ...(options.withNumbers === false
            ? {}
            : {
                  backtest: {
                      months: ['2026-07', '2026-08', '2026-09'],
                      days: 60,
                      coverage: {
                          share: 0.6,
                          covered: 36,
                          days: 60,
                          ci90: [0.5, 0.7],
                          target: 0.8,
                      },
                      mase: {
                          naive: { value: options.maseNaive ?? 0.75 },
                          mean3: {
                              value:
                                  options.maseMean3 === undefined
                                      ? 0.8
                                      : options.maseMean3,
                          },
                          max: 1,
                      },
                  },
              }),
    });

const sources = (over: Partial<ForecastSources> = {}): ForecastSources => ({
    monthKey: '2026-10',
    day: {
        day: '2026-10-05',
        band: { low: 38, p50: 46, high: 55 },
        level: 0.8,
        naive: 44,
        mean3: 41,
        done: 6,
        money: null,
        checkSource: 'estimated',
        method: 'presentations-v2',
        flowStatus: 'default-lag',
    },
    backtest: backtestOf(),
    stageEnabled: true,
    shadowMinMonths: 9,
    readinessMode: 'forecast',
    ...over,
});

const failed = (options: BacktestOptions): Partial<ForecastSources> => ({
    backtest: backtestOf({ status: 'fail', ...options }),
});

describe('прогноз без «стены»: что показать в карточке', () => {
    it('проверка пройдена и показ включён — модель, подтверждена, с вилкой', () => {
        const dto = presentForecast(sources());
        expect(dto.mode).toBe('published');
        expect(dto.shown).toEqual({
            source: 'model',
            value: 46,
            note: 'confirmed',
        });
        expect(dto.band).not.toBeNull();
    });

    it('проверка не пройдена, модель хуже расчёта по темпу — показан расчёт по темпу', () => {
        const dto = presentForecast(
            sources(
                failed({
                    reasons: ['mase-naive'],
                    maseNaive: 1.6,
                    maseMean3: 0.9,
                }),
            ),
        );
        expect(dto.mode).toBe('shadow');
        expect(dto.band).toBeNull();
        expect(dto.shown).toEqual({
            source: 'naive',
            value: 44,
            note: 'simple-better',
        });
    });

    it('модель хуже обоих простых — берётся тот, кому она проигрывает сильнее', () => {
        const dto = presentForecast(
            sources(
                failed({
                    reasons: ['mase-naive', 'mase-mean3'],
                    maseNaive: 1.2,
                    maseMean3: 2.5,
                }),
            ),
        );
        expect(dto.shown).toEqual({
            source: 'mean3',
            value: 41,
            note: 'simple-better',
        });
    });

    it('проверка не пройдена (вилка узкая), но модель точнее простых — модель с пометкой', () => {
        const dto = presentForecast(
            sources(
                failed({
                    reasons: ['coverage-below'],
                    maseNaive: 0.7,
                    maseMean3: 0.8,
                }),
            ),
        );
        expect(dto.mode).toBe('shadow');
        expect(dto.band).toBeNull();
        expect(dto.shown).toEqual({
            source: 'model',
            value: 46,
            note: 'model-unconfirmed',
        });
    });

    it('мало истории: проверки нет, ей не хватило месяцев или нет чисел — расчёт по темпу', () => {
        const byPace = { source: 'naive', value: 44, note: 'history-short' };
        expect(presentForecast(sources({ backtest: null })).shown).toEqual(
            byPace,
        );
        expect(
            presentForecast(
                sources({
                    backtest: backtestOf({
                        status: 'insufficient',
                        reasons: ['not-enough-months'],
                    }),
                }),
            ).shown,
        ).toEqual(byPace);
        expect(
            presentForecast(
                sources({
                    backtest: backtestOf({
                        status: 'fail',
                        reasons: ['no-days'],
                        withNumbers: false,
                    }),
                }),
            ).shown,
        ).toEqual(byPace);
    });

    it('теневых месяцев меньше порога, но числа проверки есть — сравнение по ним', () => {
        const dto = presentForecast(
            sources({ backtest: backtestOf({ shadowMonths: 4 }) }),
        );
        expect(dto.mode).toBe('shadow');
        expect(dto.shown).toEqual({
            source: 'model',
            value: 46,
            note: 'model-unconfirmed',
        });
    });

    it('проверка пройдена, показ не включён — число модели с пометкой, вилки нет', () => {
        const dto = presentForecast(sources({ stageEnabled: false }));
        expect(dto.mode).toBe('shadow');
        expect(dto.band).toBeNull();
        expect(dto.shown).toEqual({
            source: 'model',
            value: 46,
            note: 'stage-disabled',
        });
    });

    it('готовность портала ниже «прогноза» — расчёт по темпу', () => {
        const dto = presentForecast(sources({ readinessMode: 'norms' }));
        expect(dto.shown).toEqual({
            source: 'naive',
            value: 44,
            note: 'readiness-below',
        });
    });

    it('презентации не отмечаются — простой расчёт с уточнением; старый фронт видит no-model', () => {
        const base = sources();
        const day = base.day;
        if (day === null) throw new Error('в образце нет дня');
        const dto = presentForecast(
            sources({
                day: { ...day, flowStatus: 'not-applicable' },
                backtest: backtestOf({ status: 'insufficient' }),
            }),
        );
        expect(dto.shown).toEqual({
            source: 'naive',
            value: 44,
            note: 'no-model',
            detail: 'presentations-missing',
        });
        // В начале месяца продаж нет — по темпу ноль, берётся среднее.
        const empty = presentForecast(
            sources({
                day: { ...day, flowStatus: 'not-applicable', done: 0 },
                backtest: backtestOf({ status: 'insufficient' }),
            }),
        );
        expect(empty.shown).toMatchObject({ source: 'mean3', value: 41 });
    });

    it('месяцы посчитаны старым методом — мало истории нового расчёта, по темпу', () => {
        const expected = {
            source: 'naive',
            value: 44,
            note: 'history-short',
            detail: 'method-history-short',
        };
        // Проверка нового метода: месяцев старого нет в выборке.
        expect(
            presentForecast(
                sources({
                    backtest: backtestOf({
                        status: 'insufficient',
                        reasons: ['not-enough-months'],
                        shadowMonths: 1,
                        otherMethodMonths: 5,
                    }),
                }),
            ).shown,
        ).toEqual(expected);
        // Проверка, записанная до 18.11.2026 (по старому расчёту), — даже
        // пройденная — о новом расчёте ничего не говорит.
        const legacy = presentForecast(
            sources({ backtest: backtestOf({ method: null }) }),
        );
        expect(legacy.mode).toBe('shadow');
        expect(legacy.band).toBeNull();
        expect(legacy.shown).toEqual(expected);
        expect(legacy.shadow.monthsLogged).toBe(0);
    });

    it('журнала дня нет — показывать нечего', () => {
        expect(presentForecast(sources({ day: null })).shown).toBeNull();
        expect(
            presentForecast(sources({ day: null, backtest: null })).shown,
        ).toBeNull();
    });

    it('простой расчёт точнее модели: MASE от 1; среднего за три нет — оно не выбирается', () => {
        const day = sources().day;
        if (day === null) throw new Error('в образце нет дня');
        const numbers = (
            maseNaive: number | null,
            maseMean3: number | null,
        ) => ({
            coverageShare: 0.6,
            coverageCi90: [0.5, 0.7] as const,
            coverageTarget: 0.8,
            maseNaive,
            maseMean3,
            maseMax: 1,
            months: 3,
            days: 60,
        });
        expect(betterSimpleForecast(day, numbers(0.99, 0.5))).toBeNull();
        expect(betterSimpleForecast(day, numbers(null, null))).toBeNull();
        expect(betterSimpleForecast(day, numbers(1, null))).toEqual({
            source: 'naive',
            value: 44,
        });
        expect(
            betterSimpleForecast({ ...day, mean3: null }, numbers(0.5, 3)),
        ).toBeNull();
    });
});
