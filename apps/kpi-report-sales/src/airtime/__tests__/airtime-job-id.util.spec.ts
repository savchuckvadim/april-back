import {
    buildAirtimeDaySpanJobId,
    buildAirtimeMonthJobId,
    buildAirtimeRequestKey,
    normalizeAirtimeUserIds,
} from '../queue/airtime-job-id.util';
import {
    buildAirtimeDayMarkerKey,
    buildAirtimeDayMarkerMonthPrefix,
    buildAirtimeErrorMarkerKey,
    buildAirtimeMonthMarkerKey,
    buildAirtimeTodayKey,
    buildAirtimeTodayMonthPrefix,
} from '../cache/airtime-cache-key.util';

describe('airtime-job-id.util', () => {
    it('jobId месячной партиции содержит версию, домен и месяц', () => {
        expect(buildAirtimeMonthJobId('a.bitrix24.ru', '2026-03')).toBe(
            'airtime:v1:a.bitrix24.ru:m:2026-03',
        );
    });

    it('jobId дневного диапазона содержит границы', () => {
        expect(
            buildAirtimeDaySpanJobId(
                'a.bitrix24.ru',
                '2026-07-01',
                '2026-07-30',
            ),
        ).toBe('airtime:v1:a.bitrix24.ru:d:2026-07-01:2026-07-30');
    });

    it('изоляция порталов: разные домены дают разные jobId', () => {
        expect(buildAirtimeMonthJobId('a.bitrix24.ru', '2026-03')).not.toBe(
            buildAirtimeMonthJobId('b.bitrix24.ru', '2026-03'),
        );
    });

    it('userIds нормализуются: дедуп и сортировка по возрастанию', () => {
        expect(normalizeAirtimeUserIds([34, 12, 34, 5])).toEqual([5, 12, 34]);
    });

    it('requestKey — from|to|sortedIds (формат ключа finance-слайса фронта)', () => {
        expect(
            buildAirtimeRequestKey('2026-01-01', '2026-07-30', [34, 12, 34]),
        ).toBe('2026-01-01|2026-07-30|12_34');
    });
});

describe('airtime-cache-key.util (маркеры партиций)', () => {
    it('ключ месячного маркера оканчивается на :yyyy-MM (инварианта сброса по суффиксу)', () => {
        expect(buildAirtimeMonthMarkerKey('2026-03')).toBe('m1:2026-03');
    });

    it('ключ дневного маркера и префикс месяца согласованы', () => {
        expect(buildAirtimeDayMarkerKey('2026-07-15')).toBe('dm1:2026-07-15');
        expect(
            buildAirtimeDayMarkerKey('2026-07-15').startsWith(
                buildAirtimeDayMarkerMonthPrefix('2026-07'),
            ),
        ).toBe(true);
    });

    it('ключ today-блоба и префикс месяца согласованы', () => {
        expect(buildAirtimeTodayKey('2026-07-30')).toBe('today1:2026-07-30');
        expect(
            buildAirtimeTodayKey('2026-07-30').startsWith(
                buildAirtimeTodayMonthPrefix('2026-07'),
            ),
        ).toBe(true);
    });

    it('error-маркер живёт под отдельным ключом и не пересекается с ready-маркером', () => {
        expect(buildAirtimeErrorMarkerKey('2026-03')).toBe('err1:2026-03');
        expect(buildAirtimeErrorMarkerKey('2026-03')).not.toBe(
            buildAirtimeMonthMarkerKey('2026-03'),
        );
    });
});
