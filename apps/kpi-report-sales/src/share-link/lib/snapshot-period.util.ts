import { normalizeReportPeriod } from '../../shared/lib/date-util';
import { ShareLinkFilterSnapshotDto } from '../dto/share-link.dto';

/** Период фильтра снимка в каноничных ISO-границах (обе включительны). */
export interface SnapshotPeriod {
    fromIso: string;
    toIsoInclusive: string;
}

/**
 * Достаёт период фильтра из снимка ссылки. Снимки исторически двух эпох:
 * ISO `yyyy-MM-dd` (обе границы включительны) и `dd.MM.yyyy` с
 * ЭКСКЛЮЗИВНЫМ dateTo (+1 день — снимок реплеит тело запроса фронта в
 * Битрикс); normalizeReportPeriod различает семантику по формату.
 * Прямой Date.parse здесь ломался: `dd.MM.yyyy` → NaN → ложный 400
 * «некорректный период» на toggle обновляемости (инцидент 2026-07-30).
 * Битый/неполный снимок → null (решение — на вызывающей стороне).
 */
export function parseSnapshotPeriod(
    snapshot: Pick<ShareLinkFilterSnapshotDto, 'reportFilters'> | null,
): SnapshotPeriod | null {
    const dateFrom = snapshot?.reportFilters?.dateFrom;
    const dateTo = snapshot?.reportFilters?.dateTo;
    if (!dateFrom || !dateTo) return null;
    try {
        const period = normalizeReportPeriod(dateFrom, dateTo);
        return {
            fromIso: period.fromIso,
            toIsoInclusive: period.toIsoInclusive,
        };
    } catch {
        return null;
    }
}

/** yyyy-MM-dd → DD.MM.YYYY для человекочитаемых заголовков. */
export function formatPeriodDate(iso: string): string {
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
}
