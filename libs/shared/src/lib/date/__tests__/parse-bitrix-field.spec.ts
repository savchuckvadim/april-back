import { BitrixDateTime, ETimeZone, parseBitrixField } from '../index';

/**
 * Чтение datetime-полей Bitrix. Ключевое отличие от `parsePortalInput`:
 * поле возвращается в ДВУХ формах, и вторая (ISO со смещением) в strict-
 * парсере dayjs невалидна — `fromPortalInput` на ней бросает.
 */
describe('parseBitrixField', () => {
    const MSK = ETimeZone.EUROPE_MOSCOW;

    describe('значение без смещения — локальное время портала', () => {
        it.each([
            ['13.09.2026 16:16:12', '2026-09-13T13:16:12.000Z'],
            ['13.09.2026 16:16', '2026-09-13T13:16:00.000Z'],
            ['2026-09-13 16:16:12', '2026-09-13T13:16:12.000Z'],
            ['2026-09-13T16:16:12', '2026-09-13T13:16:12.000Z'],
        ])('%s → %s', (raw, expected) => {
            expect(parseBitrixField(raw, MSK)?.toISOString()).toBe(expected);
        });

        it('date-поле без времени — начало дня в TZ портала', () => {
            expect(parseBitrixField('13.09.2026', MSK)?.toISOString()).toBe(
                '2026-09-12T21:00:00.000Z',
            );
        });
    });

    describe('значение со смещением — момент уже абсолютный', () => {
        it('ISO со смещением портала не сдвигается повторно', () => {
            expect(
                parseBitrixField(
                    '2026-09-13T16:16:12+03:00',
                    MSK,
                )?.toISOString(),
            ).toBe('2026-09-13T13:16:12.000Z');
        });

        it('смещение из строки главнее TZ портала', () => {
            // Портал в Москве, а поле пришло с +05:00 — верим строке.
            expect(
                parseBitrixField(
                    '2026-09-13T16:16:12+05:00',
                    MSK,
                )?.toISOString(),
            ).toBe('2026-09-13T11:16:12.000Z');
        });

        it('Z (UTC)', () => {
            expect(
                parseBitrixField('2026-09-13T16:16:12Z', MSK)?.toISOString(),
            ).toBe('2026-09-13T16:16:12.000Z');
        });
    });

    describe('регресс: TZ портала не подменяется таймзоной сервера', () => {
        // Через dayjs.tz(raw, [СПИСОК форматов], tz) значение уезжало на
        // смещение сервера: на Europe/Berlin «16:16 по Москве» разбиралось
        // в 11:16 UTC вместо 13:16 UTC. Проверяем оба портала: результат
        // обязан зависеть ТОЛЬКО от TZ портала.
        it('портал в Москве (UTC+3)', () => {
            expect(
                parseBitrixField('13.09.2026 16:16:12', MSK)?.toISOString(),
            ).toBe('2026-09-13T13:16:12.000Z');
        });

        it('портал в Новосибирске (UTC+7)', () => {
            expect(
                parseBitrixField(
                    '13.09.2026 16:16:12',
                    ETimeZone.ASIA_NOVOSIBIRSK,
                )?.toISOString(),
            ).toBe('2026-09-13T09:16:12.000Z');
        });
    });

    describe('пустое и мусорное значение — null, без исключения', () => {
        it.each([
            ['пустая строка', ''],
            ['пробелы', '   '],
            ['мусор', 'не дата'],
            ['null', null],
            ['undefined', undefined],
            ['объект', { a: 1 }],
            ['массив', []],
        ])('%s → null', (_name, raw) => {
            expect(parseBitrixField(raw, MSK)).toBeNull();
        });
    });
});

describe('BitrixDateTime.fromBitrixField', () => {
    const MSK = ETimeZone.EUROPE_MOSCOW;

    it('ISO со смещением: fromPortalInput бросает, fromBitrixField — нет', () => {
        const raw = '2026-09-13T16:16:12+03:00';
        expect(() => BitrixDateTime.fromPortalInput(raw, MSK)).toThrow();
        expect(BitrixDateTime.fromBitrixField(raw, MSK)?.toCrmDateTime()).toBe(
            '13.09.2026 16:16:12',
        );
    });

    it('CRM-формат читается и пишется без искажения (round-trip)', () => {
        expect(
            BitrixDateTime.fromBitrixField(
                '13.09.2026 16:16:12',
                MSK,
            )?.toCrmDateTime(),
        ).toBe('13.09.2026 16:16:12');
    });

    it('дедлайн задачи считается в server-time Москвы', () => {
        expect(
            BitrixDateTime.fromBitrixField(
                '2026-09-13T16:16:12+03:00',
                MSK,
            )?.toTaskDeadline(),
        ).toBe('2026-09-13 16:16:12');
    });

    it('пустое значение → null', () => {
        expect(BitrixDateTime.fromBitrixField('', MSK)).toBeNull();
    });
});
