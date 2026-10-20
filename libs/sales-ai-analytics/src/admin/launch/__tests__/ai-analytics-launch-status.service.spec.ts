import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings';
import { LAUNCH_DEFAULTS } from '../launch.const';
import { AiAnalyticsLaunchStatusService } from '../services/ai-analytics-launch-status.service';
import {
    backtest,
    completeSmart,
    cost,
    DOMAIN,
    etlRun,
    NOW,
    reanalysisRun,
} from './launch-status.fixture';

/**
 * Сервис сводки запуска: читает всё параллельно и fail-open (упало одно
 * чтение — unknown у его блока).
 */
function statusSetup(overrides: { smartError?: Error } = {}) {
    const deps = {
        appSettings: {
            resolve: jest.fn().mockResolvedValue({
                aiAnalyticsEnabled: true,
                aiAnalyticsModelParams: '{"forecast_stage_enabled":true}',
            }),
        },
        portalAiSettings: {
            getByDomain: jest
                .fn()
                .mockResolvedValue({ enabled: true, allowedUserIds: [317] }),
        },
        aicallSmart: {
            resolveInfo: overrides.smartError
                ? jest.fn().mockRejectedValue(overrides.smartError)
                : jest.fn().mockResolvedValue(completeSmart()),
        },
        etlStatus: {
            status: jest.fn().mockResolvedValue({ runs: [etlRun({})] }),
        },
        phase4: {
            forecastBacktest: jest
                .fn()
                .mockResolvedValue({ items: [backtest()] }),
        },
        reanalyze: { latest: jest.fn().mockResolvedValue(reanalysisRun()) },
        transcriptions: {
            findFirstDoneAt: jest
                .fn()
                .mockResolvedValue(new Date('2026-07-20T22:30:00.000Z')),
        },
        cost: { summary: jest.fn().mockResolvedValue(cost()) },
    };
    const service = new AiAnalyticsLaunchStatusService(
        deps.appSettings as never,
        deps.portalAiSettings as never,
        deps.aicallSmart as never,
        deps.etlStatus as never,
        deps.phase4 as never,
        deps.reanalyze as never,
        deps.transcriptions as never,
        deps.cost as never,
    );
    return { service, deps };
}

describe('AiAnalyticsLaunchStatusService', () => {
    it('читает каждый источник по домену и собирает блоки', async () => {
        const { service, deps } = statusSetup();

        const status = await service.status(DOMAIN, NOW);

        expect(deps.appSettings.resolve).toHaveBeenCalledWith(
            DOMAIN,
            EnumPortalAppCode.kpiSales,
        );
        expect(deps.etlStatus.status).toHaveBeenCalledWith(
            DOMAIN,
            LAUNCH_DEFAULTS.etlWindowDays,
            NOW,
        );
        expect(deps.phase4.forecastBacktest).toHaveBeenCalledWith(
            DOMAIN,
            1,
            NOW,
        );
        expect(deps.cost.summary).toHaveBeenCalledWith(DOMAIN, '2026-10');
        expect(status.settings).toMatchObject({ state: 'done', pilotSize: 1 });
        expect(status.forecast).toMatchObject({
            status: 'pass',
            stageEnabled: true,
        });
        expect(status.reanalysis.state).toBe('running');
        // Первая транскрипция 20.07 22:30 UTC — 21.07 по Москве.
        expect(status.reanalysis.analysisSince).toBe('2026-07-21');
    });

    it('упавшее чтение не роняет сводку — блок unknown с текстом ошибки', async () => {
        const { service } = statusSetup({
            smartError: new Error('PortalModel недоступен'),
        });
        const status = await service.status(DOMAIN, NOW);
        expect(status.smart.state).toBe('unknown');
        expect(status.smart.text).toContain('PortalModel недоступен');
        expect(status.settings.state).toBe('done');
    });
});
