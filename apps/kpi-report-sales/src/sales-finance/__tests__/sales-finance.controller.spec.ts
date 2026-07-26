import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { SalesFinanceCacheService } from '../cache/sales-finance-cache.service';
import { SalesFinanceController } from '../sales-finance.controller';
import { ClosedSalesRequestDto } from '../dto/closed-sales-request.dto';
import { HotClientsRequestDto } from '../dto/hot-clients-request.dto';

function makeMocks(cachedValue: unknown = null) {
    const queue = {
        dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueueDispatcherService & { dispatch: jest.Mock };
    const cache = {
        getJson: jest.fn().mockResolvedValue(cachedValue),
        resetByPattern: jest.fn().mockResolvedValue(5),
    } as unknown as SalesFinanceCacheService & {
        getJson: jest.Mock;
        resetByPattern: jest.Mock;
    };
    return {
        queue,
        cache,
        controller: new SalesFinanceController(queue, cache),
    };
}

const closedDto: ClosedSalesRequestDto = {
    domain: 'april.bitrix24.ru',
    socketId: 'sock_1',
    filters: {
        assignedIds: [10, 20],
        dateFrom: '2026-01-01',
        dateTo: '2026-06-30',
    },
};

const hotDto: HotClientsRequestDto = {
    domain: 'april.bitrix24.ru',
    threshold: 'document',
};

describe('SalesFinanceController', () => {
    it('cache hit → status ready с данными, очередь не трогается', async () => {
        const report = { totals: { dealsCount: 1 } };
        const { controller, queue } = makeMocks(report);

        const response = await controller.getClosedSales(closedDto);

        expect(response.status).toBe('ready');
        expect(response.data).toBe(report);
        expect(queue.dispatch).not.toHaveBeenCalled();
    });

    it('cache miss → dispatch с верными Queue/JobNames и status queued', async () => {
        const { controller, queue } = makeMocks(null);

        const response = await controller.getClosedSales(closedDto);

        expect(response).toEqual({ status: 'queued' });
        expect(queue.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_FINANCE_CLOSED_SALES,
            expect.objectContaining({
                domain: closedDto.domain,
                socketId: 'sock_1',
                forceRefresh: false,
                filters: closedDto.filters,
            }),
        );
    });

    it('forceRefresh → кэш не читается, сразу dispatch', async () => {
        const { controller, queue, cache } = makeMocks({ some: 'cached' });

        const response = await controller.getClosedSales({
            ...closedDto,
            forceRefresh: true,
        });

        expect(cache.getJson).not.toHaveBeenCalled();
        expect(response.status).toBe('queued');
        expect(queue.dispatch).toHaveBeenCalledTimes(1);
    });

    it('hot-clients: miss → dispatch с JobNames.SALES_FINANCE_HOT_CLIENTS', async () => {
        const { controller, queue } = makeMocks(null);

        const response = await controller.getHotClients(hotDto);

        expect(response).toEqual({ status: 'queued' });
        expect(queue.dispatch).toHaveBeenCalledWith(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_FINANCE_HOT_CLIENTS,
            expect.objectContaining({ threshold: 'document' }),
        );
    });

    it('cache reset возвращает deletedCount и паттерн', async () => {
        const { controller, cache } = makeMocks();

        const response = await controller.resetCache({
            domain: 'april.bitrix24.ru',
            scope: 'closed',
        });

        expect(cache.resetByPattern).toHaveBeenCalledWith(
            'sales-finance:v3:april.bitrix24.ru:closed:*',
        );
        expect(response).toEqual({
            deletedCount: 5,
            pattern: 'sales-finance:v3:april.bitrix24.ru:closed:*',
        });
    });

    it('cache reset без scope чистит весь домен', async () => {
        const { controller, cache } = makeMocks();

        await controller.resetCache({ domain: 'd.ru' });

        expect(cache.resetByPattern).toHaveBeenCalledWith(
            'sales-finance:v3:d.ru:*',
        );
    });
});
