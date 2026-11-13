import {
    currentMoscowMonth,
    spendByProvider,
    spendGroups,
    spendMonthRange,
    spendNumber,
    spendProviderOf,
    spendRub,
    spendTotals,
    type SpendAggregate,
} from '../lib/transcription-spend.util';

const NOW = new Date('2026-11-13T12:00:00Z');

const agg = (
    provider: string | null,
    calls: number,
    knownSec: number,
    billedSec = knownSec,
    unknownCalls = 0,
): SpendAggregate => ({ provider, calls, knownSec, billedSec, unknownCalls });

describe('transcription-spend.util — расход на распознавание', () => {
    it('распознаватель по колонке provider: регистр и старые написания', () => {
        expect(spendProviderOf('yandex')).toBe('yandex');
        expect(spendProviderOf('Yandex SpeechKit')).toBe('yandex');
        expect(spendProviderOf('bitrix-vibecode')).toBe('vibecode');
        expect(spendProviderOf('local-whisper')).toBe('whisper');
        expect(spendProviderOf('openai')).toBe('other');
        expect(spendProviderOf(null)).toBe('other');
    });

    it('месяц по Москве: границы в UTC, сдвиг через год, кривой месяц — текущий', () => {
        expect(spendMonthRange('2026-11', NOW)).toEqual({
            month: '2026-11',
            from: new Date('2026-10-31T21:00:00.000Z'),
            to: new Date('2026-11-30T21:00:00.000Z'),
        });
        expect(spendMonthRange('2026-01', NOW, -1)).toEqual({
            month: '2025-12',
            from: new Date('2025-11-30T21:00:00.000Z'),
            to: new Date('2025-12-31T21:00:00.000Z'),
        });
        expect(spendMonthRange('2026-12', NOW).to).toEqual(
            new Date('2026-12-31T21:00:00.000Z'),
        );
        expect(spendMonthRange('2026-13', NOW).month).toBe('2026-11');
        expect(spendMonthRange(undefined, NOW).month).toBe('2026-11');
    });

    it('текущий месяц считается по Москве: 31.10 22:00 UTC — уже ноябрь', () => {
        expect(currentMoscowMonth(new Date('2026-10-31T22:00:00Z'))).toBe(
            '2026-11',
        );
        expect(currentMoscowMonth(new Date('2026-10-31T20:00:00Z'))).toBe(
            '2026-10',
        );
    });

    it('рубли: 60 копеек за минуту — 0,01 ₽ за секунду, до копеек', () => {
        expect(spendRub(3600, 60)).toBe(36);
        expect(spendRub(15, 60)).toBe(0.15);
        expect(spendRub(100, 15)).toBe(0.25);
    });

    it('числа из сырого SQL: bigint, Decimal, строка, null', () => {
        expect(spendNumber(BigInt(12))).toBe(12);
        expect(spendNumber({ toString: () => '345.0' })).toBe(345);
        expect(spendNumber('7')).toBe(7);
        expect(spendNumber(null)).toBe(0);
        expect(spendNumber('мусор')).toBe(0);
    });

    it('по распознавателям: платит только Яндекс, порядок фиксированный, пустые скрыты', () => {
        const providers = spendByProvider(
            [
                agg('bitrix-vibecode', 10, 1800),
                agg('yandex', 3, 3000, 3015, 1),
                agg('Yandex', 1, 600),
                agg('local-whisper', 0, 0),
            ],
            60,
        );
        expect(providers.map(item => item.provider)).toEqual([
            'yandex',
            'vibecode',
        ]);
        expect(providers[0]).toEqual({
            provider: 'yandex',
            label: 'Яндекс',
            paid: true,
            calls: 4,
            minutes: 60,
            billedMinutes: 60.3,
            rub: 36.15,
            unknownDurationCalls: 1,
        });
        expect(providers[1]).toMatchObject({
            paid: false,
            calls: 10,
            minutes: 30,
            billedMinutes: 0,
            rub: 0,
        });
        expect(spendTotals(providers)).toEqual({
            calls: 14,
            minutes: 90,
            rub: 36.15,
            yandexCalls: 4,
            yandexMinutes: 60,
            unknownDurationCalls: 1,
        });
    });

    it('итог без Яндекса — нули у Яндекса; пустой срез — нули', () => {
        expect(
            spendTotals(spendByProvider([agg('bitrix-vibecode', 2, 120)], 60)),
        ).toMatchObject({
            calls: 2,
            rub: 0,
            yandexCalls: 0,
            yandexMinutes: 0,
        });
        expect(spendTotals([])).toEqual({
            calls: 0,
            minutes: 0,
            rub: 0,
            yandexCalls: 0,
            yandexMinutes: 0,
            unknownDurationCalls: 0,
        });
    });

    it('группы по ключу сводятся отдельно', () => {
        const rows = [
            { ...agg('yandex', 1, 60), key: 'a' },
            { ...agg('bitrix-vibecode', 2, 120), key: 'b' },
            { ...agg('yandex', 1, 60), key: 'b' },
        ];
        const groups = spendGroups(rows, row => row.key, 60);
        expect([...groups.keys()]).toEqual(['a', 'b']);
        expect(groups.get('a')?.totals.rub).toBe(0.6);
        expect(groups.get('b')?.totals).toMatchObject({ calls: 3, rub: 0.6 });
    });
});
