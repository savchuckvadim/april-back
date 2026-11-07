import type { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { settingsLoaderWith } from '../../__tests__/fixtures/lite-row.fixture';
import type { AiAnalyticsPortalsLoader } from '../../domain/loaders/portals.loader';
import type { AiOwnerReportDeliverySettings } from '../../domain/loaders/settings.loader';
import { OWNER_REPORT_DELIVERY_JOB_OPTIONS } from '../../owner-report/owner-report-delivery.types';
import { OwnerReportScheduler } from '../owner-report.scheduler';

const DOMAIN = 'gsr.bitrix24.ru';
const at = (iso: string): Date => new Date(iso);
/** 09:05 по Москве в день date — слот выпуска. */
const moscowSlot = (date: string): Date => at(`${date}T06:05:00Z`);

const ownerReport = (
    overrides: Partial<AiOwnerReportDeliverySettings> = {},
): AiOwnerReportDeliverySettings => ({
    enabled: true,
    kinds: ['month'],
    userIds: [447],
    diskFolderId: null,
    dryRun: true,
    ...overrides,
});

function makeScheduler(
    domains: string[],
    settings: Parameters<typeof settingsLoaderWith>[0],
) {
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const loader = settingsLoaderWith(settings);
    const scheduler = new OwnerReportScheduler(
        {
            listDomains: jest.fn().mockResolvedValue(domains),
        } as unknown as AiAnalyticsPortalsLoader,
        loader,
        { dispatch } as unknown as QueueDispatcherService,
    );
    return { scheduler, dispatch, loader };
}

describe('OwnerReportScheduler — крон выпуска отчёта собственнику', () => {
    it('второй рабочий день месяца в слоте — джоба выпуска за прошлый месяц', async () => {
        // Ноябрь 2026: 2-е (пн) — первый рабочий день, 3-е (вт) — второй.
        const { scheduler, dispatch } = makeScheduler([DOMAIN], {
            ownerReport: ownerReport(),
        });
        const jobIds = await scheduler.dispatchAll(moscowSlot('2026-11-03'));
        expect(jobIds).toEqual([
            `ai-analytics:owner-report-delivery:${DOMAIN}:month:2026-10`,
        ]);
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_OWNER_REPORT_DELIVERY,
            {
                domain: DOMAIN,
                kind: 'month',
                periodKey: '2026-10',
                date: '2026-11-03',
            },
            jobIds[0],
            OWNER_REPORT_DELIVERY_JOB_OPTIONS,
        );
    });

    it('первый рабочий день или чужой час — без выпуска', async () => {
        const { scheduler, dispatch } = makeScheduler([DOMAIN], {
            ownerReport: ownerReport(),
        });
        expect(await scheduler.dispatchAll(moscowSlot('2026-11-02'))).toEqual(
            [],
        );
        expect(await scheduler.dispatchAll(at('2026-11-03T10:05:00Z'))).toEqual(
            [],
        );
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('праздник портала 2 ноября сдвигает второй рабочий день на 4-е', async () => {
        const { scheduler } = makeScheduler([DOMAIN], {
            ownerReport: ownerReport(),
            holidays: ['2026-11-02'],
        });
        expect(await scheduler.dispatchAll(moscowSlot('2026-11-03'))).toEqual(
            [],
        );
        expect(
            await scheduler.dispatchAll(moscowSlot('2026-11-04')),
        ).toHaveLength(1);
    });

    it('в октябре с включённым кварталом — по джобе на месяц и квартал', async () => {
        // Октябрь 2026: 1-е (чт) — первый рабочий день, 2-е (пт) — второй.
        const { scheduler } = makeScheduler([DOMAIN], {
            ownerReport: ownerReport({ kinds: ['month', 'quarter'] }),
        });
        expect(await scheduler.dispatchAll(moscowSlot('2026-10-02'))).toEqual([
            `ai-analytics:owner-report-delivery:${DOMAIN}:month:2026-09`,
            `ai-analytics:owner-report-delivery:${DOMAIN}:quarter:2026-Q3`,
        ]);
    });

    it('выключенный выпуск или выключенная AI-аналитика — портал пропускается', async () => {
        const off = makeScheduler([DOMAIN], {
            ownerReport: ownerReport({ enabled: false }),
        });
        expect(
            await off.scheduler.dispatchAll(moscowSlot('2026-11-03')),
        ).toEqual([]);
        const aiOff = makeScheduler([DOMAIN], {
            enabled: false,
            ownerReport: ownerReport(),
        });
        expect(
            await aiOff.scheduler.dispatchAll(moscowSlot('2026-11-03')),
        ).toEqual([]);
    });

    it('ошибка настроек одного портала не останавливает остальные', async () => {
        const { scheduler, loader } = makeScheduler(
            ['broken.bitrix24.ru', DOMAIN],
            { ownerReport: ownerReport() },
        );
        jest.spyOn(loader, 'load').mockRejectedValueOnce(
            new Error('портал недоступен'),
        );
        expect(await scheduler.dispatchAll(moscowSlot('2026-11-03'))).toEqual([
            `ai-analytics:owner-report-delivery:${DOMAIN}:month:2026-10`,
        ]);
    });
});
