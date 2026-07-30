import { AirtimeDispatchService } from '../services/airtime-dispatch.service';
import type { AirtimeReadiness } from '../services/airtime-assembly.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';

const DOMAIN = 'example.bitrix24.ru';

const readinessFixture = (): AirtimeReadiness => ({
    units: [
        {
            unit: { kind: 'month', month: '2026-05' },
            status: 'ready',
            rowsFetched: 10,
            truncated: false,
            todayBlob: null,
        },
        {
            unit: { kind: 'month', month: '2026-06' },
            status: 'queued',
            rowsFetched: 0,
            truncated: false,
            todayBlob: null,
        },
        {
            unit: {
                kind: 'span',
                month: '2026-07',
                from: '2026-07-01',
                to: '2026-07-30',
                includesToday: true,
            },
            status: 'queued',
            rowsFetched: 0,
            truncated: false,
            todayBlob: null,
        },
        {
            unit: { kind: 'month', month: '2026-04' },
            status: 'error',
            rowsFetched: 0,
            truncated: false,
            todayBlob: null,
            errorMessage: 'упал',
        },
    ],
    totalMonths: 4,
    readyMonths: 1,
    allReady: false,
    hasError: true,
    errorMessage: 'упал',
    months: [],
});

const ctx = {
    socketId: 'socket-1',
    requestKey: '2026-04-01|2026-07-31|1_2',
    dateFrom: '2026-04-01' as const,
    dateTo: '2026-07-31' as const,
    forceRefresh: false,
};

describe('AirtimeDispatchService', () => {
    it("ставит job'ы только на queued-юниты: ready и error пропускаются", async () => {
        const queue = { dispatch: jest.fn(() => Promise.resolve(undefined)) };
        const service = new AirtimeDispatchService(queue as never);

        const dispatched = await service.dispatchMissing(
            DOMAIN,
            readinessFixture(),
            ctx,
        );

        expect(dispatched).toBe(2);
        expect(queue.dispatch).toHaveBeenCalledTimes(2);
    });

    it('месячный job уходит с детерминированным jobId и опциями дедупа/ретраев', async () => {
        const queue = { dispatch: jest.fn(() => Promise.resolve(undefined)) };
        const service = new AirtimeDispatchService(queue as never);

        await service.dispatchMissing(DOMAIN, readinessFixture(), ctx);

        expect(queue.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.AIRTIME_MONTH_PARTITION,
            {
                domain: DOMAIN,
                month: '2026-06',
                requestKey: ctx.requestKey,
                socketId: 'socket-1',
                dateFrom: '2026-04-01',
                dateTo: '2026-07-31',
            },
            'airtime:v1:example.bitrix24.ru:m:2026-06',
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 15_000 },
                priority: 5,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    });

    it("порционность: за один вызов ставится не больше лимита job'ов", async () => {
        const queue = { dispatch: jest.fn(() => Promise.resolve(undefined)) };
        const service = new AirtimeDispatchService(queue as never);
        const readiness: AirtimeReadiness = {
            units: Array.from({ length: 20 }, (_, i) => ({
                unit: {
                    kind: 'month' as const,
                    month: `2024-${String((i % 12) + 1).padStart(2, '0')}` as never,
                },
                status: 'queued' as const,
                rowsFetched: 0,
                truncated: false,
                todayBlob: null,
            })),
            totalMonths: 20,
            readyMonths: 0,
            allReady: false,
            hasError: false,
            months: [],
        };

        const dispatched = await service.dispatchMissing(
            DOMAIN,
            readiness,
            ctx,
        );

        expect(dispatched).toBe(6);
        expect(queue.dispatch).toHaveBeenCalledTimes(6);
    });

    it('span-job уходит с границами диапазона и forceRefresh в данных', async () => {
        const queue = { dispatch: jest.fn(() => Promise.resolve(undefined)) };
        const service = new AirtimeDispatchService(queue as never);

        await service.dispatchMissing(DOMAIN, readinessFixture(), {
            ...ctx,
            forceRefresh: true,
        });

        expect(queue.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.AIRTIME_DAY_SPAN,
            expect.objectContaining({
                domain: DOMAIN,
                from: '2026-07-01',
                to: '2026-07-30',
                forceRefresh: true,
            }),
            'airtime:v1:example.bitrix24.ru:d:2026-07-01:2026-07-30',
            expect.objectContaining({ removeOnComplete: true }),
        );
    });
});
