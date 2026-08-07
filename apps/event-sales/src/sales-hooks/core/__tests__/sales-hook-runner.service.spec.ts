import { SalesHookRunnerService } from '../services/sales-hook-runner.service';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';
import {
    EnumSalesHookSource,
    SalesHookJobData,
} from '../contracts/sales-hook-job.type';
import { SALES_HOOK_WS_EVENTS } from '../constants/sales-hook.const';

// Runner создаёт SalesBatchGroupBuffer (реэкспорт ColdHookBatchGroupBuffer);
// подменяем модуль, чтобы не тянуть реальный bitrix.
const flushMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../shared/batch', () => ({
    SalesBatchGroupBuffer: jest.fn().mockImplementation(() => ({
        queue: jest.fn(),
        endGroup: jest.fn(),
        flush: flushMock,
        getResults: jest.fn().mockReturnValue([]),
        getCurrentGroupSize: jest.fn().mockReturnValue(0),
        getBufferSize: jest.fn().mockReturnValue(0),
    })),
}));

describe('SalesHookRunnerService', () => {
    const job: SalesHookJobData = {
        hook: EnumSalesHookCode.LEAD_TO_WORK,
        domain: 'example.bitrix24.ru',
        operationId: 'op-1',
        source: EnumSalesHookSource.FRAME,
        socketId: 'socket-1',
        items: [{ leadId: 42 }],
    };

    const makeRunner = (
        overrides: {
            statusFound?: boolean;
            executeError?: Error;
        } = {},
    ) => {
        const operation = {
            operationId: 'op-1',
            domain: job.domain,
            hook: job.hook,
        };
        const status = {
            get: jest
                .fn()
                .mockResolvedValue(
                    overrides.statusFound === false ? null : operation,
                ),
            setRunning: jest.fn().mockResolvedValue(operation),
            setDone: jest.fn().mockResolvedValue({
                ...operation,
                status: 'done',
            }),
            setFailed: jest.fn().mockResolvedValue({
                ...operation,
                status: 'failed',
            }),
        };
        const execute = overrides.executeError
            ? jest.fn().mockRejectedValue(overrides.executeError)
            : jest.fn().mockResolvedValue({ implemented: false });
        const registry = {
            get: jest.fn().mockReturnValue({ execute }),
        };
        const pbx = {
            init: jest.fn().mockResolvedValue({
                bitrix: {},
                PortalModel: {},
            }),
        };
        const ws = { sendToClient: jest.fn() };
        const runner = new SalesHookRunnerService(
            pbx as never,
            status as never,
            registry as never,
            ws as never,
        );
        return { runner, status, registry, pbx, ws, execute };
    };

    beforeEach(() => flushMock.mockClear());

    it('без статуса операции use-case не вызывается', async () => {
        const { runner, registry, pbx } = makeRunner({ statusFound: false });
        await runner.run(job);
        expect(pbx.init).not.toHaveBeenCalled();
        expect(registry.get).not.toHaveBeenCalled();
    });

    it('успех: running → execute → flush → done → WS done', async () => {
        const { runner, status, ws, execute } = makeRunner();
        await runner.run(job);

        expect(status.setRunning).toHaveBeenCalled();
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: job.domain,
                hook: job.hook,
                operationId: 'op-1',
            }),
            job.items,
        );
        expect(flushMock).toHaveBeenCalled();
        expect(status.setDone).toHaveBeenCalled();
        expect(ws.sendToClient).toHaveBeenCalledWith(
            'socket-1',
            expect.objectContaining({ event: SALES_HOOK_WS_EVENTS.DONE }),
        );
    });

    it('ошибка: failed + WS error + rethrow (для Bull-retry)', async () => {
        const boom = new Error('Битрикс недоступен');
        const { runner, status, ws } = makeRunner({ executeError: boom });

        await expect(runner.run(job)).rejects.toThrow('Битрикс недоступен');
        expect(status.setFailed).toHaveBeenCalledWith(
            expect.anything(),
            'Битрикс недоступен',
            expect.any(String),
        );
        expect(ws.sendToClient).toHaveBeenCalledWith(
            'socket-1',
            expect.objectContaining({ event: SALES_HOOK_WS_EVENTS.ERROR }),
        );
    });

    it('без socketId WS не вызывается', async () => {
        const { runner, ws } = makeRunner();
        await runner.run({ ...job, socketId: undefined });
        expect(ws.sendToClient).not.toHaveBeenCalled();
    });
});
