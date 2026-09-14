import {
    AI_PIPELINE_ESTIMANDS,
    CIF_SALE_INF_PARAM_CODE,
    CIF_SALE_INF_RANGE,
    LAG_CDF_DEFAULTS,
    LAG_CDF_PARAM_CODE,
    LAG_CDF_VALUE_RANGE,
    SaleLag,
    exponentialLagCdf,
    isValidCifSaleInf,
    isValidLagCdfValue,
    kaplanMeierLagCdf,
    lagCdfFromTable,
    maturityFloor,
    meanMaturity,
    selectSaleLags,
    validatePipelineParamValue,
} from '../model/lag-cdf';
import { registryDefault } from '../params/registry.access';
import { findParam } from '../params/registry.const';
import { resolveParam } from '../params/resolve';

/**
 * Распределение лага `F(d)` среди проданных эпизодов и средняя зрелость
 * (план §4.8; Фаза 2, поток `p2-model-forecast-plan`).
 *
 * Ключевое исправление ревизии — шкала: `F(d)` идёт от нуля до единицы,
 * доля «не купят» сидит в `θ_j`, а не в `F`. Поэтому `F(28) = 0,5`
 * допустимо, а диапазон [0,03; 0,3] относится к другой величине —
 * безусловной CIF продажи `cif_sale_inf`.
 */

/** Медиана цикла портала по умолчанию. */
const MEDIAN_DAYS = LAG_CDF_DEFAULTS.medianDays;

/** Одинаковые продажи заданного лага. */
const sales = (days: number, count: number): SaleLag[] =>
    Array.from({ length: count }, () => ({ days }));

describe('exponentialLagCdf', () => {
    const cdf = exponentialLagCdf(MEDIAN_DAYS);

    it('медиана 28 дней даёт F(28) = 0,5 ровно', () => {
        expect(MEDIAN_DAYS).toBe(28);
        expect(cdf.at(28)).toBeCloseTo(0.5, 10);
    });

    it('F(12) = 0,26 при той же медиане', () => {
        expect(cdf.at(12)).toBeCloseTo(0.257, 3);
        expect(Number(cdf.at(12).toFixed(2))).toBe(0.26);
    });

    it('F(0) = 0, монотонно и стремится к 1 (cure-форма)', () => {
        expect(cdf.at(0)).toBe(0);
        expect(cdf.at(-5)).toBe(0);
        for (let day = 1; day <= 120; day += 1) {
            expect(cdf.at(day)).toBeGreaterThanOrEqual(cdf.at(day - 1));
        }
        expect(cdf.at(3660)).toBeCloseTo(1, 10);
    });

    it('нечисловая медиана откатывается к дефолту реестра', () => {
        expect(exponentialLagCdf(Number.NaN).at(28)).toBeCloseTo(0.5, 10);
        expect(exponentialLagCdf(0).medianDays).toBe(MEDIAN_DAYS);
    });
});

describe('meanMaturity', () => {
    const cdf = exponentialLagCdf(MEDIAN_DAYS);

    it('F̄(12) ≈ 0,14 при медиане 28 — среднее по дням, а не F(12)', () => {
        const fBar = meanMaturity(cdf, 12);
        expect(fBar).toBeCloseTo(0.1455, 4);
        // Иллюстрация плана «≈ 0,14»: расхождение с точным значением — только
        // округление до двух знаков, относительная разница 4 %.
        expect(Math.abs(fBar - 0.14)).toBeLessThan(0.01);
        // Средняя зрелость строго ниже значения на последний день.
        expect(fBar).toBeLessThan(cdf.at(12));
    });

    it('нулевой и отрицательный остаток месяца дают ноль', () => {
        expect(meanMaturity(cdf, 0)).toBe(0);
        expect(meanMaturity(cdf, -3)).toBe(0);
        expect(meanMaturity(cdf, Number.NaN)).toBe(0);
    });

    it('растёт с остатком месяца', () => {
        expect(meanMaturity(cdf, 30)).toBeGreaterThan(meanMaturity(cdf, 12));
    });
});

describe('maturityFloor', () => {
    it('зрелость ниже f_min заменяется порогом 0,1', () => {
        expect(maturityFloor(0.03)).toBeCloseTo(LAG_CDF_DEFAULTS.fMin, 10);
        expect(LAG_CDF_DEFAULTS.fMin).toBe(0.1);
        expect(maturityFloor(0.2)).toBeCloseTo(0.2, 10);
    });
});

describe('шкала F(d) против безусловной CIF — через реестр параметров', () => {
    it('дескриптор lag_cdf_F: диапазон [0; 1], условное на продажу, оценка', () => {
        const descriptor = findParam(LAG_CDF_PARAM_CODE);

        expect(descriptor?.range).toEqual([0, 1]);
        expect(descriptor?.source).toBe('estimated');
        expect(LAG_CDF_VALUE_RANGE).toEqual(descriptor?.range);
        expect(findParam('pipeline_estimand')?.defaultValue).toBe('cure');
    });

    it('реестр не отвергает F(28) = 0,5 — resolveParam берёт значение слоя', () => {
        const resolved = resolveParam(LAG_CDF_PARAM_CODE, {
            portal: { [LAG_CDF_PARAM_CODE]: exponentialLagCdf(28).at(28) },
        });

        expect(resolved.reason).toBeUndefined();
        expect(resolved.value).toBeCloseTo(0.5, 10);
        expect(isValidLagCdfValue(0.5)).toBe(true);
        expect(validatePipelineParamValue(LAG_CDF_PARAM_CODE, 0.5)).toBe(true);
        expect(validatePipelineParamValue(LAG_CDF_PARAM_CODE, 1)).toBe(true);
        expect(validatePipelineParamValue(LAG_CDF_PARAM_CODE, 1.2)).toBe(false);
    });

    it('диапазон [0,03; 0,3] относится только к cif_sale_inf: 0,5 отвергается', () => {
        expect(findParam(CIF_SALE_INF_PARAM_CODE)?.range).toEqual([0.03, 0.3]);
        expect(CIF_SALE_INF_RANGE).toEqual([0.03, 0.3]);
        expect(
            resolveParam(CIF_SALE_INF_PARAM_CODE, {
                portal: { [CIF_SALE_INF_PARAM_CODE]: 0.5 },
            }),
        ).toMatchObject({
            value: 0.09,
            source: 'default',
            reason: 'out-of-range',
        });
        expect(isValidCifSaleInf(0.5)).toBe(false);
        expect(isValidCifSaleInf(0.09)).toBe(true);
        expect(validatePipelineParamValue(CIF_SALE_INF_PARAM_CODE, 0.5)).toBe(
            false,
        );
        expect(validatePipelineParamValue(CIF_SALE_INF_PARAM_CODE, 0.09)).toBe(
            true,
        );
    });

    it('коды реестра разные — регресс на разделение величин', () => {
        expect(LAG_CDF_PARAM_CODE).toBe('lag_cdf_F');
        expect(CIF_SALE_INF_PARAM_CODE).toBe('cif_sale_inf');
        expect(LAG_CDF_PARAM_CODE).not.toBe(CIF_SALE_INF_PARAM_CODE);
    });

    it('дефолты F(d) берутся из реестра, а не из литералов', () => {
        expect(LAG_CDF_DEFAULTS.medianDays).toBe(
            registryDefault('cycle_median_days'),
        );
        expect(LAG_CDF_DEFAULTS.windowDays).toBe(
            registryDefault('lag_window_sale_days'),
        );
        expect(LAG_CDF_DEFAULTS.fMin).toBe(registryDefault('f_min'));
        expect(LAG_CDF_DEFAULTS.minSales).toBe(
            findParam(LAG_CDF_PARAM_CODE)?.minN,
        );
        expect(AI_PIPELINE_ESTIMANDS).toEqual(
            findParam('pipeline_estimand')?.enumValues,
        );
    });
});

describe('selectSaleLags', () => {
    it('лаг больше окна атрибуции цензурируется по границе окна', () => {
        const selected = selectSaleLags(
            [{ days: 10 }, { days: 61 }, { days: 200 }],
            LAG_CDF_DEFAULTS.windowDays,
        );
        expect(LAG_CDF_DEFAULTS.windowDays).toBe(60);
        expect(selected).toEqual([
            { days: 10, censored: false },
            { days: 60, censored: true },
            { days: 60, censored: true },
        ]);
    });

    it('окно можно сузить настройкой портала', () => {
        expect(selectSaleLags([{ days: 45 }], 30)).toEqual([
            { days: 30, censored: true },
        ]);
    });
});

describe('kaplanMeierLagCdf', () => {
    it('таблица строится только при ≥ 30 закрытых продажах', () => {
        expect(kaplanMeierLagCdf(sales(10, 29))).toBeNull();
        expect(kaplanMeierLagCdf(sales(10, 30))).not.toBeNull();
    });

    it('F(∞) = 1 в cure-форме и ступени монотонны', () => {
        const cdf = kaplanMeierLagCdf([...sales(10, 20), ...sales(30, 20)]);
        expect(cdf).not.toBeNull();
        expect(cdf?.kind).toBe('kaplan-meier');
        expect(cdf?.n).toBe(40);
        expect(cdf?.at(10)).toBeCloseTo(0.5, 10);
        expect(cdf?.at(30)).toBeCloseTo(1, 10);
        expect(cdf?.at(365)).toBeCloseTo(1, 10);
        expect(cdf?.medianDays).toBe(10);
    });

    it('продажи за окном атрибуции в оценку не входят', () => {
        const withLate = [...sales(20, 30), ...sales(200, 10)];
        const cdf = kaplanMeierLagCdf(withLate);
        expect(cdf?.n).toBe(30);
        expect(cdf?.at(19)).toBe(0);
        expect(cdf?.at(20)).toBeCloseTo(1, 10);
    });
});

describe('lagCdfFromTable', () => {
    it('сортирует, клипует и делает бегущий максимум', () => {
        const cdf = lagCdfFromTable([
            { days: 30, value: 0.7 },
            { days: 10, value: 0.4 },
            { days: 20, value: 0.2 },
            { days: 60, value: 1.4 },
        ]);
        expect(cdf.at(5)).toBe(0);
        expect(cdf.at(10)).toBeCloseTo(0.4, 10);
        expect(cdf.at(20)).toBeCloseTo(0.4, 10);
        expect(cdf.at(30)).toBeCloseTo(0.7, 10);
        expect(cdf.at(60)).toBeCloseTo(1, 10);
    });

    it('normalize приводит таблицу к cure-форме F(∞) = 1', () => {
        const cdf = lagCdfFromTable(
            [
                { days: 10, value: 0.1 },
                { days: 40, value: 0.2 },
            ],
            { normalize: true, n: 50 },
        );
        expect(cdf.at(10)).toBeCloseTo(0.5, 10);
        expect(cdf.at(40)).toBeCloseTo(1, 10);
        expect(cdf.n).toBe(50);
    });
});
