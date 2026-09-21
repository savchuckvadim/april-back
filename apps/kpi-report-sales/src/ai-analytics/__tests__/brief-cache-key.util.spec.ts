import {
    buildBriefKey,
    buildBriefPeriodKey,
    buildBriefQuotaKey,
    buildBriefRosterKey,
} from '../brief/brief-cache-key.util';
import { AI_BRIEF_PERIOD_KEY_MAX_LENGTH } from '../constants/ai-brief.const';
import {
    AI_ANALYTICS_SNAPSHOT_HASH_LENGTH,
    isSnapshotPeriodKey,
} from '../store/snapshot-serialize.util';

/**
 * Ключи резюме: кэш и джоба — по packHash, снапшот `ai-analytics-brief`
 * — по периоду и нормализованному ростеру (ретенция, долг 40 волны C).
 */
const FROM = '2026-09-01';
const TO = '2026-09-07';

describe('ключи кэша резюме', () => {
    it('ключ результата и квоты — по схеме секций кэша', () => {
        expect(buildBriefKey('a.bitrix24.ru', 'abc123')).toBe(
            'sales-ai-analytics:v1:a.bitrix24.ru:brief:abc123',
        );
        expect(buildBriefQuotaKey('a.bitrix24.ru', '2026-09-08')).toBe(
            'sales-ai-analytics:v1:a.bitrix24.ru:brief-quota:2026-09-08',
        );
    });
});

describe('buildBriefPeriodKey — период и нормализованный ростер', () => {
    it('ростер нормализуется: уникальные id по возрастанию, порядок не важен', () => {
        expect(buildBriefPeriodKey(FROM, TO, [20, 10, 10])).toBe(
            '2026-09-01_2026-09-07_10_20',
        );
        expect(buildBriefPeriodKey(FROM, TO, ['10', 20])).toBe(
            buildBriefPeriodKey(FROM, TO, [20, 10]),
        );
    });

    it('пустой ростер — весь отдел (all); другой состав — другой ключ', () => {
        expect(buildBriefPeriodKey(FROM, TO, [])).toBe(
            '2026-09-01_2026-09-07_all',
        );
        expect(buildBriefPeriodKey(FROM, TO, [10])).not.toBe(
            buildBriefPeriodKey(FROM, TO, [10, 20]),
        );
        expect(buildBriefPeriodKey(FROM, '2026-09-14', [10])).not.toBe(
            buildBriefPeriodKey(FROM, TO, [10]),
        );
    });

    it('длинный ростер хэшируется, и ключ укладывается в форму зерна portal-hash', () => {
        const roster = Array.from({ length: 40 }, (_, index) => 100 + index);
        const key = buildBriefPeriodKey(FROM, TO, roster);
        const rosterKey = buildBriefRosterKey(FROM, TO, roster);

        expect(rosterKey).toMatch(
            new RegExp(`^[0-9a-f]{${AI_ANALYTICS_SNAPSHOT_HASH_LENGTH}}$`),
        );
        expect(key).toBe(`${FROM}_${TO}_${rosterKey}`);
        expect(key.length).toBeLessThanOrEqual(AI_BRIEF_PERIOD_KEY_MAX_LENGTH);
        expect(isSnapshotPeriodKey('portal-hash', key)).toBe(true);
        // Тот же состав в другом порядке — тот же хэш.
        expect(buildBriefPeriodKey(FROM, TO, [...roster].reverse())).toBe(key);
        // Короткий ростер хэша не получает.
        expect(
            isSnapshotPeriodKey(
                'portal-hash',
                buildBriefPeriodKey(FROM, TO, [10, 20]),
            ),
        ).toBe(true);
    });

    it('граница: ростер ровно по потолку не хэшируется, на символ длиннее — хэшируется', () => {
        const prefix = `${FROM}_${TO}_`.length;
        const fits = Array.from(
            {
                length: Math.floor(
                    (AI_BRIEF_PERIOD_KEY_MAX_LENGTH - prefix + 1) / 3,
                ),
            },
            (_, index) => 10 + index,
        );
        const fitsKey = buildBriefRosterKey(FROM, TO, fits);
        const overflow = [...fits, 99];

        expect(prefix + fitsKey.length).toBeLessThanOrEqual(
            AI_BRIEF_PERIOD_KEY_MAX_LENGTH,
        );
        expect(fitsKey).toBe(fits.join('_'));
        expect(buildBriefRosterKey(FROM, TO, overflow)).toHaveLength(
            AI_ANALYTICS_SNAPSHOT_HASH_LENGTH,
        );
    });
});
