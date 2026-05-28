import { CounterWithRqs, RqCounterPivot } from './counter.types';
import { CounterType } from './counter-type.enum';
import { serializeCounter, serializePivot } from './counter-serialize.util';

const pivot: RqCounterPivot = {
    value: 10,
    type: CounterType.OFFER,
    prefix: 'INV',
    postfix: null,
    day: false,
    year: true,
    month: false,
    count: 5,
    size: 1,
};

describe('counter-serialize.util', () => {
    describe('serializePivot', () => {
        it('возвращает поля pivot 1:1 и сужает type до enum', () => {
            const result = serializePivot(pivot);

            expect(result).toEqual({
                value: 10,
                type: CounterType.OFFER,
                prefix: 'INV',
                postfix: null,
                day: false,
                year: true,
                month: false,
                count: 5,
                size: 1,
            });
        });

        it.each([
            [CounterType.INVOICE, CounterType.INVOICE],
            [CounterType.OFFER, CounterType.OFFER],
            [CounterType.CONTRACT, CounterType.CONTRACT],
        ])(
            'распознаёт известный type "%s" и возвращает enum-значение',
            (raw, expected) => {
                const result = serializePivot({ ...pivot, type: raw });
                expect(result.type).toBe(expected);
            },
        );

        it('возвращает type: null для неизвестной строки', () => {
            const result = serializePivot({ ...pivot, type: 'unknown' });
            expect(result.type).toBeNull();
        });

        it('возвращает type: null если в БД хранится null', () => {
            const result = serializePivot({ ...pivot, type: null });
            expect(result.type).toBeNull();
        });
    });

    describe('serializeCounter', () => {
        it('возвращает null, если на вход пришёл null', () => {
            expect(serializeCounter(null)).toBeNull();
        });

        it('преобразует BigInt id и id связей в строки', () => {
            const counter = {
                id: 7n,
                name: 'offer_counter',
                title: 'Счётчик КП',
                created_at: new Date('2026-01-01T00:00:00Z'),
                updated_at: new Date('2026-01-02T00:00:00Z'),
                rq_counter: [
                    {
                        ...pivot,
                        rq_id: 42n,
                        rqs: { name: 'ООО Тест' },
                    },
                ],
            } as unknown as CounterWithRqs;

            const result = serializeCounter(counter);

            expect(result).not.toBeNull();
            expect(result?.id).toBe('7');
            expect(result?.rqs).toHaveLength(1);
            expect(result?.rqs?.[0].rq_id).toBe('42');
            expect(result?.rqs?.[0].rq_name).toBe('ООО Тест');
        });

        it('возвращает rq_name = null, если у rqs.name пусто', () => {
            const counter = {
                id: 1n,
                name: 'c',
                title: 't',
                created_at: null,
                updated_at: null,
                rq_counter: [
                    {
                        ...pivot,
                        rq_id: 99n,
                        rqs: { name: null },
                    },
                ],
            } as unknown as CounterWithRqs;

            const result = serializeCounter(counter);
            expect(result?.rqs?.[0].rq_name).toBeNull();
        });
    });
});
