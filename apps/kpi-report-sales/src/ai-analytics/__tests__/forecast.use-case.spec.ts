import { ForbiddenException } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type ForecastBacktestSnapshot,
    type ForecastLogDay,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsForecastController } from '../ai-analytics-forecast.controller';
import { AI_FORECAST_ROUTE } from '../constants/ai-forecast.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { ForecastUseCase } from '../domain/use-cases/forecast.use-case';
import { settingsLoaderWith } from './fixtures/lite-row.fixture';

const DOMAIN = 'april.bitrix24.ru';

/** 01.10.2026 01:30 по Москве — уже октябрь в TZ портала, в UTC ещё сентябрь. */
const NOW = new Date('2026-09-30T22:30:00.000Z');

const logDay = (day: string, done: number): ForecastLogDay => ({
    day,
    low: 38,
    p50: 46,
    high: 55,
    level: 0.8,
    phi: 1.4,
    phiSource: 'estimated',
    naive: 44,
    mean3: 41.3,
    done,
    money: { low: 3_800_000, p50: 4_600_000, high: 5_500_000 },
    managers: 7,
    pipelineUnknown: 0,
    modelSnapshotId: '501',
});

const backtestPayload = (
    over: Partial<ForecastBacktestSnapshot> = {},
): Partial<ForecastBacktestSnapshot> => ({
    monthKey: '2026-09',
    status: 'pass',
    reasons: [],
    shadowMonths: 9,
    shadowMinMonths: 9,
    backtest: null,
    ...over,
});

interface Stand {
    logDays?: ForecastLogDay[] | null;
    backtest?: Partial<ForecastBacktestSnapshot> | null;
    portal?: Record<string, unknown>;
    /** Режим готовности из кэша settings/get; Error — чтение упало. */
    readinessMode?: string | Error;
}

function makeUseCase(stand: Stand = {}) {
    const logs =
        stand.logDays === null
            ? []
            : [
                  {
                      periodKey: '2026-10',
                      payload: {
                          monthKey: '2026-10',
                          days: stand.logDays ?? [logDay('2026-10-01', 1)],
                      },
                  },
              ];
    // Проверки точности окна: догон с forceRefresh записал старый месяц
    // последним — берётся самый поздний месяц, а не последняя запись.
    const backtests =
        stand.backtest === null
            ? []
            : [
                  {
                      periodKey: '2026-09',
                      payload: stand.backtest ?? backtestPayload(),
                  },
                  {
                      periodKey: '2025-11',
                      payload: backtestPayload({
                          monthKey: '2025-11',
                          status: 'insufficient',
                          shadowMonths: 0,
                      }),
                  },
              ];
    const findByKeys = jest.fn((_domain: string, type: string) =>
        Promise.resolve(
            type === AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest
                ? backtests
                : logs,
        ),
    );
    const latest = jest.fn().mockResolvedValue(null);
    const params = {
        load: jest.fn().mockResolvedValue({
            ctx: { portal: stand.portal ?? { forecast_stage_enabled: true } },
        }),
    };
    const mode = stand.readinessMode ?? 'forecast';
    const cachedSettings = {
        readinessMode: jest.fn(() =>
            mode instanceof Error
                ? Promise.reject(mode)
                : Promise.resolve(mode),
        ),
    };
    return {
        useCase: new ForecastUseCase(
            settingsLoaderWith(),
            params as never,
            { findByKeys, latest } as never,
            cachedSettings as never,
        ),
        findByKeys,
        latest,
        cachedSettings,
    };
}

describe('ForecastUseCase — прогноз отдела', () => {
    it('читает журнал текущего месяца в TZ портала и последнюю проверку точности', async () => {
        const { useCase, findByKeys, latest } = makeUseCase();

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(dto.monthKey).toBe('2026-10');
        expect(findByKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecastLog,
            { periodKeys: ['2026-10'], managerIds: [null], latestOnly: true },
        );
        expect(findByKeys).toHaveBeenCalledWith(
            DOMAIN,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecastBacktest,
            expect.objectContaining({ managerIds: [null], latestOnly: true }),
        );
        expect(latest).not.toHaveBeenCalled();
        expect(dto.shadow.backtest?.monthKey).toBe('2026-09');
    });

    it('гейт пройден и флаг включён — published: вилка и рубли по последнему дню журнала', async () => {
        const { useCase } = makeUseCase({
            logDays: [logDay('2026-10-02', 3), logDay('2026-10-01', 1)],
        });

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(dto.mode).toBe('published');
        expect(dto.reasons).toEqual([]);
        expect(dto.asOf).toBe('2026-10-02');
        expect(dto.band).toEqual({ low: 38, p50: 46, high: 55 });
        expect(dto.money).toEqual({
            low: 3_800_000,
            p50: 4_600_000,
            high: 5_500_000,
        });
        expect(dto.done).toBe(3);
        expect(dto.shadow.monthsLogged).toBe(9);
    });

    it('флаг ступени выключен (дефолт реестра) — shadow без вилки и денег, сводка на месте', async () => {
        const { useCase } = makeUseCase({ portal: {} });

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(dto.mode).toBe('shadow');
        expect(dto.band).toBeNull();
        expect(dto.money).toBeNull();
        expect(dto.reasons).toEqual(['forecast-stage-disabled']);
        expect(dto.shadow.minMonths).toBe(9);
        expect(dto.shadow.backtest?.status).toBe('pass');
        // Простые прогнозы и сделанное — факты, отдаются и в shadow.
        expect(dto.naive).toBe(44);
        expect(dto.done).toBe(1);
    });

    it('ничего ещё не записано — shadow с порогом из реестра и всеми причинами по порядку', async () => {
        // Флаг выключен (дефолт): при непройденном гейте «выключено» не пишется.
        const { useCase } = makeUseCase({
            logDays: null,
            backtest: null,
            portal: {},
        });

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(dto).toMatchObject({
            mode: 'shadow',
            asOf: null,
            level: null,
            band: null,
            done: null,
            naive: null,
            mean3: null,
            shadow: { monthsLogged: 0, minMonths: 9, backtest: null },
        });
        expect(dto.reasons).toEqual([
            'forecast-shadow-months-below-9',
            'forecast-backtest-insufficient',
            'forecast-log-missing',
        ]);
    });

    it('режим готовности — из кэша settings/get: ниже «прогноза» вилка не отдаётся', async () => {
        const { useCase, cachedSettings } = makeUseCase({
            readinessMode: 'descriptive',
        });

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(cachedSettings.readinessMode).toHaveBeenCalledWith(DOMAIN);
        expect(dto.mode).toBe('shadow');
        expect(dto.band).toBeNull();
        expect(dto.money).toBeNull();
        expect(dto.reasons).toEqual(['forecast-readiness-below']);
    });

    it('готовность не прочиталась — ручка не падает, решает гейт прогноза', async () => {
        const { useCase } = makeUseCase({
            readinessMode: new Error('redis down'),
        });

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(dto.mode).toBe('published');
    });

    it('проверка провалена — причины бэктеста в кодах витрины, без повторов', async () => {
        const { useCase } = makeUseCase({
            backtest: backtestPayload({
                status: 'fail',
                reasons: ['coverage-below', 'mase-naive', 'mase-mean3'],
            }),
        });

        const dto = await useCase.execute(DOMAIN, NOW);

        expect(dto.mode).toBe('shadow');
        expect(dto.reasons).toEqual([
            'forecast-coverage-outside',
            'forecast-mase-not-below',
        ]);
    });
});

describe('AiAnalyticsForecastController — только руководителям', () => {
    const data = { monthKey: '2026-10' };

    function makeController(role: 'manager' | 'op') {
        const access = new RequesterAccessService(
            {} as never,
            {} as never,
            {} as never,
        );
        jest.spyOn(access, 'resolve').mockResolvedValue({
            role,
            visibleManagerIds: role === 'op' ? null : ['512'],
        });
        const forecast = { execute: jest.fn().mockResolvedValue(data) };
        return {
            controller: new AiAnalyticsForecastController(
                access,
                forecast as never,
            ),
            forecast,
        };
    }

    const body = { domain: DOMAIN, requesterUserId: '447' };

    it('руководитель получает конверт ready с ключом месяца', async () => {
        const { controller, forecast } = makeController('op');

        await expect(controller.getForecast(body)).resolves.toEqual({
            status: 'ready',
            requestKey: `${DOMAIN}:${AI_FORECAST_ROUTE}:2026-10`,
            data,
        });
        expect(forecast.execute).toHaveBeenCalledWith(DOMAIN);
    });

    it('менеджер → 403, прогноз не читается', async () => {
        const { controller, forecast } = makeController('manager');

        await expect(controller.getForecast(body)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(forecast.execute).not.toHaveBeenCalled();
    });
});
