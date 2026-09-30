import {
    ManagerForecastPoint,
    aggregateDepartment,
    departmentBand,
    forecastBand,
} from '../model/forecast-interval';
import { NEGBIN_DEFAULTS, sampleNegBin } from '../model/negbin';
import { mulberry32, seedOf } from '../model/prng';

/**
 * Вилка прогноза P10/P50/P90 (план §4.8, §10 L4; Фаза 4, поток
 * `p4-forecast-model`): случайна только ещё не случившаяся часть месяца,
 * покрытие вилки на симуляции NegBin ≈ уровню, отдел — сумма менеджеров
 * в фиксированном порядке.
 */
describe('forecastBand', () => {
    it('вилка вокруг остатка: Y₀ входит в границы целиком', () => {
        const band = forecastBand({ p50: 14, doneSales: 4, phi: 1 });
        expect(band.remaining).toBe(10);
        // Пуассон(10): P10 = 6, P90 = 14 → плюс Y₀ = 4.
        expect(band.low).toBe(10);
        expect(band.high).toBe(18);
        expect(band.p50).toBe(14);
        expect(band.level).toBe(NEGBIN_DEFAULTS.level);
        expect(band.phi).toBe(1);
        expect(band.phiSource).toBe('default');
    });

    it('без φ берётся дефолт реестра; источник передаётся как есть', () => {
        const band = forecastBand({
            p50: 30,
            doneSales: 10,
            phiSource: 'estimated',
            phi: 3,
        });
        expect(band.phi).toBe(3);
        expect(band.phiSource).toBe('estimated');
        expect(forecastBand({ p50: 30, doneSales: 10 }).phi).toBe(
            NEGBIN_DEFAULTS.phi,
        );
    });

    it('интервал упорядочен и содержит P50 даже при малом остатке и большом φ', () => {
        for (const [p50, done, phi] of [
            [0.1, 0, 6],
            [3.2, 3, 6],
            [0, 0, 2.5],
            [5, 8, 2.5],
        ]) {
            const band = forecastBand({ p50, doneSales: done, phi });
            expect(band.low).toBeLessThanOrEqual(band.p50);
            expect(band.p50).toBeLessThanOrEqual(band.high);
            expect(band.low).toBeGreaterThanOrEqual(done);
        }
    });

    it('P50 ниже Y₀ поднимается до Y₀ — остаток не бывает отрицательным', () => {
        const band = forecastBand({ p50: 5, doneSales: 8, phi: 2 });
        expect(band).toMatchObject({ low: 8, p50: 8, high: 8, remaining: 0 });
    });

    it('покрытие вилки на симуляции NegBin ≈ level ± 0,05', () => {
        const phi = 2.5;
        const level = 0.8;
        const random = mulberry32(seedOf('forecast-band', 'coverage', 1));
        const draws = 3000;
        let covered = 0;
        for (let draw = 0; draw < draws; draw += 1) {
            const done = Math.floor(random() * 10);
            const remaining = 10 + random() * 30;
            const band = forecastBand({
                p50: done + remaining,
                doneSales: done,
                phi,
                level,
            });
            const actual = done + sampleNegBin(remaining, phi, random);
            if (band.low <= actual && actual <= band.high) covered += 1;
        }
        const share = covered / draws;
        expect(share).toBeGreaterThan(level - 0.05);
        expect(share).toBeLessThan(level + 0.05);
    });

    it('детерминизм: одинаковый вход → toEqual', () => {
        const input = { p50: 22.4, doneSales: 7, phi: 2.5 };
        expect(forecastBand(input)).toEqual(forecastBand(input));
    });
});

const managers: ManagerForecastPoint[] = [
    { managerId: 'm2', p50: 6.5, doneSales: 2, naive: 7, descriptive: 4 },
    {
        managerId: 'm1',
        p50: 3,
        doneSales: 1,
        naive: 2,
        descriptive: 1,
        pipelineKnown: false,
    },
    { managerId: 'm3', p50: 10, doneSales: 4, naive: 9, descriptive: 8 },
];

describe('aggregateDepartment', () => {
    it('суммирует P50, Y₀, наивную базу, описательную часть и остаток', () => {
        expect(aggregateDepartment(managers)).toEqual({
            p50: 19.5,
            done: 7,
            naive: 18,
            descriptive: 13,
            remaining: 12.5,
            managers: 3,
            pipelineUnknown: 1,
        });
    });

    it('порядок на входе не меняет результат (фиксированный порядок id)', () => {
        const reversed = [...managers].reverse();
        expect(aggregateDepartment(reversed)).toEqual(
            aggregateDepartment(managers),
        );
    });

    it('пустой отдел — нули', () => {
        expect(aggregateDepartment([])).toEqual({
            p50: 0,
            done: 0,
            naive: 0,
            descriptive: 0,
            remaining: 0,
            managers: 0,
            pipelineUnknown: 0,
        });
    });

    it('P50 менеджера ниже Y₀ и NaN не дают отрицательного остатка', () => {
        const aggregate = aggregateDepartment([
            { managerId: 'a', p50: 1, doneSales: 3, naive: Number.NaN },
        ]);
        expect(aggregate).toMatchObject({
            p50: 3,
            done: 3,
            naive: 0,
            remaining: 0,
        });
    });
});

describe('departmentBand', () => {
    it('вилка отдела строится по сумме остатков с общим φ', () => {
        const band = departmentBand({ managers, phi: 2, level: 0.8 });
        const direct = forecastBand({
            p50: 19.5,
            doneSales: 7,
            phi: 2,
            level: 0.8,
        });
        expect(band).toEqual(direct);
        expect(band.low).toBeLessThanOrEqual(band.p50);
        expect(band.high).toBeGreaterThanOrEqual(band.p50);
    });

    it('вилка отдела уже суммы вилок менеджеров (сложение остатков)', () => {
        const separate = managers.map(manager =>
            forecastBand({
                p50: manager.p50,
                doneSales: manager.doneSales,
                phi: 2,
            }),
        );
        const summedWidth = separate.reduce(
            (sum, band) => sum + (band.high - band.low),
            0,
        );
        const band = departmentBand({ managers, phi: 2 });
        expect(band.high - band.low).toBeLessThanOrEqual(summedWidth);
    });
});
