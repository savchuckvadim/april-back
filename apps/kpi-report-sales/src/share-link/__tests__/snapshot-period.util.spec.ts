import {
    formatPeriodDate,
    parseSnapshotPeriod,
} from '../lib/snapshot-period.util';
import { ShareLinkFilterSnapshotDto } from '../dto/share-link.dto';

const snapshotWith = (
    dateFrom: string,
    dateTo: string,
): Pick<ShareLinkFilterSnapshotDto, 'reportFilters'> =>
    ({
        reportFilters: { dateFrom, dateTo },
    }) as Pick<ShareLinkFilterSnapshotDto, 'reportFilters'>;

describe('parseSnapshotPeriod', () => {
    it('ISO-снимок: обе границы включительны, отдаются как есть', () => {
        expect(
            parseSnapshotPeriod(snapshotWith('2026-07-01', '2026-07-31')),
        ).toEqual({ fromIso: '2026-07-01', toIsoInclusive: '2026-07-31' });
    });

    it('легаси dd.MM.yyyy: dateTo эксклюзивен — включительный конец на день раньше', () => {
        // Тело фронта в Битрикс: to = выбранная дата + 1 день.
        expect(
            parseSnapshotPeriod(snapshotWith('01.07.2026', '01.08.2026')),
        ).toEqual({ fromIso: '2026-07-01', toIsoInclusive: '2026-07-31' });
    });

    it('месяц в легаси-формате проходит лимит 31 день (инцидент toggle → 400)', () => {
        const period = parseSnapshotPeriod(
            snapshotWith('30.07.2026', '31.08.2026'),
        );
        expect(period).not.toBeNull();
        const days =
            (Date.parse(period!.toIsoInclusive) - Date.parse(period!.fromIso)) /
            (24 * 3600 * 1000);
        expect(days).toBeLessThanOrEqual(31);
    });

    it('битые/неполные данные → null (мусор, смешанные форматы, пустота)', () => {
        expect(parseSnapshotPeriod(null)).toBeNull();
        expect(
            parseSnapshotPeriod(
                {} as Pick<ShareLinkFilterSnapshotDto, 'reportFilters'>,
            ),
        ).toBeNull();
        expect(parseSnapshotPeriod(snapshotWith('', '2026-07-31'))).toBeNull();
        expect(
            parseSnapshotPeriod(snapshotWith('мусор', '31.08.2026')),
        ).toBeNull();
        expect(
            parseSnapshotPeriod(snapshotWith('2026-07-01', '31.08.2026')),
        ).toBeNull();
    });

    it('перевёрнутый период (from позже to) → null', () => {
        expect(
            parseSnapshotPeriod(snapshotWith('2026-08-01', '2026-07-01')),
        ).toBeNull();
    });
});

describe('formatPeriodDate', () => {
    it('yyyy-MM-dd → DD.MM.YYYY', () => {
        expect(formatPeriodDate('2026-07-01')).toBe('01.07.2026');
    });
});
