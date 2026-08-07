import { IBatchGroupBuffer, SalesBatchGroupBuffer } from '..';

/**
 * Страж контракта: если при рефакторинге cold-hook буфер разойдётся с
 * IBatchGroupBuffer — упадёт этот тест (и компиляция), а не прод.
 */
describe('SalesBatchGroupBuffer соответствует IBatchGroupBuffer', () => {
    const makeBitrix = () => ({
        api: {
            callBatchWithConcurrency: jest.fn().mockResolvedValue([]),
        },
    });

    it('структурно реализует контракт (компайл-тайм + smoke)', async () => {
        const buffer: IBatchGroupBuffer = new SalesBatchGroupBuffer(
            makeBitrix() as never,
        );

        const enqueue = jest.fn();
        buffer.queue(enqueue);
        expect(buffer.getCurrentGroupSize()).toBe(1);

        await buffer.endGroup();
        // Отложенный enqueue выполняется именно в endGroup, не в queue.
        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(buffer.getCurrentGroupSize()).toBe(0);
        expect(buffer.getBufferSize()).toBe(1);

        await buffer.flush();
        expect(buffer.getBufferSize()).toBe(0);
        expect(buffer.getResults()).toEqual([]);
    });
});
