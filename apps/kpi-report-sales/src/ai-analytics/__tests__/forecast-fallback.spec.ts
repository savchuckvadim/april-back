import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import {
    departmentMonthSales,
    fallbackForecast,
    fallbackMonthKeys,
} from '../domain/presenter/forecast-fallback.util';
import { presentForecast } from '../domain/presenter/forecast.presenter';
import { ForecastUseCase } from '../domain/use-cases/forecast.use-case';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const DOMAIN = 'april.bitrix24.ru';

const month = (periodKey: string, managerId: string, salesCount: number) => ({
    periodKey,
    managerId,
    payload: { finance: { salesCount } },
});

/**
 * Прогноз без журнала дня: карточка всё равно показывает число — простой
 * расчёт по месячным продажам отдела (решение владельца 16.11.2026).
 */
describe('запасной расчёт прогноза', () => {
    it('продажи отдела — сумма по менеджерам; последняя запись менеджер-месяца побеждает', () => {
        const sums = departmentMonthSales([
            month('2026-11', '317', 3),
            month('2026-11', '318', 4),
            month('2026-11', '317', 5),
            month('2026-10', '317', 20),
            // Портальная запись и запись без продаж в сумму не идут.
            { periodKey: '2026-11', managerId: null, payload: {} },
            { periodKey: '2026-09', managerId: '317', payload: { kpi: {} } },
        ]);

        expect([...sums]).toEqual([
            ['2026-11', 9],
            ['2026-10', 20],
        ]);
    });

    it('нужны текущий месяц и три прошлых', () => {
        expect(fallbackMonthKeys('2026-11-16')).toEqual([
            '2026-11',
            '2026-08',
            '2026-09',
            '2026-10',
        ]);
        expect(fallbackMonthKeys('2026-01-05')).toEqual([
            '2026-01',
            '2025-10',
            '2025-11',
            '2025-12',
        ]);
    });

    it('середина месяца: расчёт по темпу с начала месяца', () => {
        const fallback = fallbackForecast(
            '2026-11-16',
            new Map([
                ['2026-11', 16],
                ['2026-10', 40],
                ['2026-09', 30],
                ['2026-08', 35],
            ]),
        );

        expect(fallback).toEqual({
            asOf: '2026-11-16',
            done: 16,
            naive: 30,
            mean3: 35,
            shown: { source: 'naive', value: 30, note: 'no-model' },
        });
    });

    it('первые дни месяца или продаж ещё нет: среднее за три прошлых месяца, темп слишком шумный', () => {
        const history: [string, number][] = [
            ['2026-10', 40],
            ['2026-09', 30],
            ['2026-08', 35],
        ];

        expect(
            fallbackForecast(
                '2026-11-02',
                new Map([['2026-11', 3], ...history]),
            )?.shown,
        ).toEqual({ source: 'mean3', value: 35, note: 'no-model' });
        expect(
            fallbackForecast(
                '2026-11-16',
                new Map([['2026-11', 0], ...history]),
            )?.shown,
        ).toEqual({ source: 'mean3', value: 35, note: 'no-model' });
        // Снимка текущего месяца ещё нет вовсе.
        expect(fallbackForecast('2026-11-16', new Map(history))).toMatchObject({
            done: null,
            naive: null,
            mean3: 35,
        });
    });

    it('прошлых месяцев не хватает: темп даже в первые дни; нет ничего — показывать нечего', () => {
        expect(
            fallbackForecast('2026-11-02', new Map([['2026-11', 2]]))?.shown,
        ).toEqual({ source: 'naive', value: 30, note: 'no-model' });
        // Продаж ноль и истории нет — честный ноль по темпу.
        expect(
            fallbackForecast('2026-11-10', new Map([['2026-11', 0]]))?.shown,
        ).toEqual({ source: 'naive', value: 0, note: 'no-model' });
        expect(fallbackForecast('2026-11-10', new Map())).toBeNull();
        // Двух месяцев из трёх для среднего мало.
        expect(
            fallbackForecast(
                '2026-11-10',
                new Map([
                    ['2026-10', 40],
                    ['2026-09', 30],
                ]),
            ),
        ).toBeNull();
    });

    it('презентер: журнала дня нет — число, «сделано» и день берутся из запасного расчёта; вилки нет', () => {
        const dto = presentForecast({
            monthKey: '2026-11',
            day: null,
            backtest: null,
            stageEnabled: false,
            shadowMinMonths: 9,
            readinessMode: 'descriptive',
            fallback: fallbackForecast(
                '2026-11-16',
                new Map([['2026-11', 16]]),
            ),
        });

        expect(dto).toMatchObject({
            mode: 'shadow',
            asOf: '2026-11-16',
            done: 16,
            naive: 30,
            mean3: null,
            band: null,
            money: null,
            shown: { source: 'naive', value: 30, note: 'no-model' },
        });
    });
});

describe('ForecastUseCase — журнала дня нет', () => {
    /** 16.11.2026 12:00 по Москве. */
    const NOW = new Date('2026-11-16T09:00:00.000Z');

    const makeUseCase = (months: unknown[] | Error) => {
        const findByKeys = jest.fn((_domain: string, type: string) => {
            if (type !== AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth) {
                return Promise.resolve([]);
            }
            return months instanceof Error
                ? Promise.reject(months)
                : Promise.resolve(months);
        });
        const useCase = new ForecastUseCase(
            settingsLoaderWith(),
            {
                load: jest.fn().mockResolvedValue({ ctx: { portal: {} } }),
            } as never,
            { findByKeys, latest: jest.fn().mockResolvedValue(null) } as never,
            {
                readinessMode: jest.fn().mockResolvedValue('descriptive'),
            } as never,
        );
        return { useCase, findByKeys };
    };

    it('число считается по месячным снимкам менеджеров — один узкий запрос на четыре месяца', async () => {
        const { useCase, findByKeys } = makeUseCase([
            month('2026-11', '317', 10),
            month('2026-11', '318', 6),
        ]);

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(dto.shown).toEqual({
            source: 'naive',
            value: 30,
            note: 'no-model',
        });
        expect(dto.done).toBe(16);
        expect(dto.asOf).toBe('2026-11-16');
        expect(findByKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            {
                periodKeys: ['2026-11', '2026-08', '2026-09', '2026-10'],
                latestOnly: true,
            },
        );
    });

    it('снимков нет или они не прочитались — ручка отвечает без числа и не падает', async () => {
        const empty = await makeUseCase([]).useCase.execute(DOMAIN, NOW);
        expect(empty.shown).toBeNull();

        const failed = await makeUseCase(
            new Error('база недоступна'),
        ).useCase.execute(DOMAIN, NOW);
        expect(failed.shown).toBeNull();
        expect(failed.mode).toBe('shadow');
    });
});
