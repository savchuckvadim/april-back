import {
    applyCreateTimestamps,
    applyCreateTimestampsToData,
    applyUpdateTimestamps,
    buildTimestampFlagsMap,
    TimestampFlags,
} from '../laravel-timestamps.extension';

describe('laravel-timestamps extension', () => {
    const now = new Date('2026-06-24T12:00:00.000Z');
    const both: TimestampFlags = { hasCreatedAt: true, hasUpdatedAt: true };

    describe('buildTimestampFlagsMap', () => {
        it('распознаёт наличие колонок created_at/updated_at по DMMF', () => {
            const map = buildTimestampFlagsMap([
                {
                    name: 'with_both',
                    fields: [
                        { name: 'id' },
                        { name: 'created_at' },
                        { name: 'updated_at' },
                    ],
                },
                {
                    name: 'created_only',
                    fields: [{ name: 'id' }, { name: 'created_at' }],
                },
                { name: 'none', fields: [{ name: 'id' }] },
            ]);

            expect(map.get('with_both')).toEqual({
                hasCreatedAt: true,
                hasUpdatedAt: true,
            });
            expect(map.get('created_only')).toEqual({
                hasCreatedAt: true,
                hasUpdatedAt: false,
            });
            expect(map.get('none')).toEqual({
                hasCreatedAt: false,
                hasUpdatedAt: false,
            });
        });
    });

    describe('applyCreateTimestamps', () => {
        it('проставляет created_at и updated_at, когда они не заданы', () => {
            const data: Record<string, unknown> = { name: 'кг' };
            applyCreateTimestamps(data, both, now);
            expect(data.created_at).toBe(now);
            expect(data.updated_at).toBe(now);
        });

        it('не перетирает явно переданные значения', () => {
            const explicit = new Date('2020-01-01T00:00:00.000Z');
            const data: Record<string, unknown> = {
                created_at: explicit,
                updated_at: null,
            };
            applyCreateTimestamps(data, both, now);
            expect(data.created_at).toBe(explicit);
            expect(data.updated_at).toBeNull();
        });

        it('не трогает поля, которых нет у модели', () => {
            const data: Record<string, unknown> = {};
            applyCreateTimestamps(
                data,
                { hasCreatedAt: false, hasUpdatedAt: false },
                now,
            );
            expect(data).toEqual({});
        });

        it('игнорирует не-объект (например, undefined data)', () => {
            expect(() =>
                applyCreateTimestamps(undefined, both, now),
            ).not.toThrow();
        });
    });

    describe('applyCreateTimestampsToData', () => {
        it('проставляет таймстампы каждому элементу массива (createMany)', () => {
            const rows: Record<string, unknown>[] = [
                { name: 'a' },
                { name: 'b', created_at: undefined },
            ];
            applyCreateTimestampsToData(rows, both, now);
            for (const row of rows) {
                expect(row.created_at).toBe(now);
                expect(row.updated_at).toBe(now);
            }
        });
    });

    describe('applyUpdateTimestamps', () => {
        it('проставляет только updated_at', () => {
            const data: Record<string, unknown> = { name: 'кг' };
            applyUpdateTimestamps(data, both, now);
            expect(data.created_at).toBeUndefined();
            expect(data.updated_at).toBe(now);
        });

        it('не перетирает явно переданный updated_at', () => {
            const explicit = new Date('2020-01-01T00:00:00.000Z');
            const data: Record<string, unknown> = { updated_at: explicit };
            applyUpdateTimestamps(data, both, now);
            expect(data.updated_at).toBe(explicit);
        });
    });
});
