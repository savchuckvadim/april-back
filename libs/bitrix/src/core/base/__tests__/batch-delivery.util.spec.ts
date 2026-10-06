import {
    BitrixBatchUndeliveredError,
    assertBatchDelivered,
    isDeliveredBatchChunk,
} from '../batch-delivery.util';

/**
 * Не дошедшая пачка ≠ ошибка отдельной команды: первое — «данных нет»,
 * второе бывает ожидаемым («элемент уже существует») и падением не считается.
 */
describe('доставка пачки', () => {
    it('ответ с result — дошла, даже если у команд есть свои ошибки', () => {
        expect(
            isDeliveredBatchChunk({
                result: {},
                result_error: {
                    add_item: 'Элемент с таким кодом уже существует',
                },
            }),
        ).toBe(true);
    });

    it('объект ошибки вместо ответа — не дошла', () => {
        expect(
            isDeliveredBatchChunk(new Error('timeout of 30000ms exceeded')),
        ).toBe(false);
        expect(isDeliveredBatchChunk(undefined)).toBe(false);
    });

    it('хоть одна пачка не дошла — понятная ошибка с кодом 503', () => {
        expect(() =>
            assertBatchDelivered(
                [{ result: {} }, new Error('timeout')],
                'Связи клиента',
            ),
        ).toThrow(BitrixBatchUndeliveredError);
        try {
            assertBatchDelivered([new Error('timeout')], 'Связи клиента');
        } catch (error) {
            const failure = error as BitrixBatchUndeliveredError;
            expect(failure.getStatus()).toBe(503);
            expect(failure.message).toContain('Связи клиента');
            expect(failure.failed).toBe(1);
        }
    });

    it('все дошли — тихо', () => {
        expect(() =>
            assertBatchDelivered(
                [{ result: {} }, { result: { a: 1 } }],
                'Поиск',
            ),
        ).not.toThrow();
    });
});
