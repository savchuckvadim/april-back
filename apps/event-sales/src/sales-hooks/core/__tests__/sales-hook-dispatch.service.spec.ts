import { SalesHookDispatchService } from '../services/sales-hook-dispatch.service';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../contracts/sales-hook-job.type';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';

describe('SalesHookDispatchService', () => {
    const makeService = () => {
        const dispatch = jest.fn().mockResolvedValue({});
        const queue = { dispatch };
        const statusStore = new Map<string, unknown>();
        const status = {
            get: jest.fn((domain: string, id: string) =>
                Promise.resolve(statusStore.get(id) ?? null),
            ),
            setQueued: jest.fn((job: { operationId: string }) => {
                const operation = { operationId: job.operationId };
                statusStore.set(job.operationId, operation);
                return Promise.resolve(operation);
            }),
        };
        const idempotency = {
            getSeenOperationId: jest.fn().mockResolvedValue(null),
            markSeen: jest.fn().mockResolvedValue(undefined),
            getAliasOperationId: jest.fn().mockResolvedValue(null),
            setAliasOperationId: jest.fn().mockResolvedValue(undefined),
        };
        const service = new SalesHookDispatchService(
            queue as never,
            status as never,
            idempotency as never,
        );
        return { service, dispatch, status, idempotency, statusStore };
    };

    const item = (key = 'lead:42', fp = 'fp1') => ({
        entityKey: key,
        fingerprint: fp,
        data: { leadId: 42 },
    });

    it('создаёт операцию и диспатчит job с jobId = operationId', async () => {
        const { service, dispatch } = makeService();
        const operation = await service.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            'example.bitrix24.ru',
            EnumSalesHookSource.FRAME,
            [item()],
        );

        expect(operation).not.toBeNull();
        expect(dispatch).toHaveBeenCalledWith(
            QueueNames.EVENT_SALES_HOOK_OPS,
            JobNames.SALES_HOOK_LEAD_TO_WORK,
            expect.objectContaining({
                operationId: operation?.operationId,
                items: [{ leadId: 42 }],
            }),
            operation?.operationId,
            { removeOnComplete: true, removeOnFail: false },
        );
    });

    it('повторный запрос с тем же operationId возвращает существующую операцию без dispatch', async () => {
        const { service, dispatch, statusStore } = makeService();
        statusStore.set('op-1', { operationId: 'op-1' });

        const operation = await service.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            'example.bitrix24.ru',
            EnumSalesHookSource.FRAME,
            [item()],
            { operationId: 'op-1' },
        );

        expect(operation).toEqual({ operationId: 'op-1' });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('двойной клик без operationId схлопывается через alias', async () => {
        const { service, dispatch, idempotency, statusStore } = makeService();
        idempotency.getAliasOperationId.mockResolvedValueOnce('op-alias');
        statusStore.set('op-alias', { operationId: 'op-alias' });

        const operation = await service.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            'example.bitrix24.ru',
            EnumSalesHookSource.FRAME,
            [item()],
        );

        expect(operation).toEqual({ operationId: 'op-alias' });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('пачка робота дедуплицируется по fingerprint внутри пачки', async () => {
        const { service, dispatch } = makeService();
        await service.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            'example.bitrix24.ru',
            EnumSalesHookSource.ROBOT,
            [item('lead:42', 'same'), item('lead:42', 'same')],
        );

        const calls = dispatch.mock.calls as unknown as [
            unknown,
            unknown,
            { items: unknown[] },
        ][];
        expect(calls[0][2].items).toHaveLength(1);
    });

    it('полностью повторная пачка возвращает операцию из seen-маркера, dispatch не зовётся', async () => {
        const { service, dispatch, idempotency, statusStore } = makeService();
        idempotency.getSeenOperationId.mockResolvedValue('op-prev');
        statusStore.set('op-prev', { operationId: 'op-prev' });

        const operation = await service.accept(
            EnumSalesHookCode.LEAD_TO_WORK,
            'example.bitrix24.ru',
            EnumSalesHookSource.ROBOT,
            [item()],
        );

        expect(operation).toEqual({ operationId: 'op-prev' });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('свежие элементы помечаются seen после постановки', async () => {
        const { service, idempotency } = makeService();
        const operation = await service.accept(
            EnumSalesHookCode.REJECT_BUFFER,
            'example.bitrix24.ru',
            EnumSalesHookSource.ROBOT,
            [item('company:7', 'fp-company')],
        );
        expect(idempotency.markSeen).toHaveBeenCalledWith(
            'example.bitrix24.ru',
            'fp-company',
            operation?.operationId,
        );
    });
});
