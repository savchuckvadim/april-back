import {
    AI_ANALYSIS_SERIES_START,
    versionBreakIndex,
} from '@lib/sales-ai-analytics';
import {
    weekSeriesOf,
    type TrendSnapshotRecord,
} from '../domain/assembler/trends.series';
import { seriesSignatureOf } from '../domain/assembler/week-versions.util';
import {
    TRENDS_WEEK_KEYS,
    WEEK_CALLS,
    weekPayload as fixturePayload,
} from './fixtures/trends.fixture';

/**
 * Ряды трендов рвёт смена СЕРИИ версий разбора, а не любая правка строки
 * (политика владельца, октябрь 2026: «одна серия с 25.06.2026»). Сигнатура
 * считается при чтении сохранённых `payload.versions` — старые снимки
 * недель лечатся без пересчёта.
 */

/** Набор версий, как его писал разбор 3.1 (06.11.2026). */
const V31 = {
    prompt: 'focus-v3.1-2026-11-06',
    rubric: 'sections-7-v2',
    registry: 'a1b2c3d4e5f6',
    attribution: '2026-08-24',
    classifier: '2026-10-21',
};
const V32 = { ...V31, prompt: 'focus-v3.2-2026-11-16' };
const V33 = { ...V31, prompt: 'focus-v3.3-2026-11-17' };

/** Нагрузка недели с оценкой и версиями разбора (null — версий нет). */
const weekPayload = (score: number, versions: Record<string, string> | null) =>
    fixturePayload(score, WEEK_CALLS, versions);

/** Недели подряд с заданными нагрузками → индекс разрыва ряда качества. */
function qualityBreak(payloads: readonly Record<string, unknown>[]): number {
    const records: TrendSnapshotRecord[] = payloads.map(
        (payload, index) => ({
            periodKey: TRENDS_WEEK_KEYS[index],
            managerId: '10',
            payload,
        }),
    );
    const quality = weekSeriesOf(records).find(
        series => series.metric === 'quality',
    );

    return versionBreakIndex(quality?.points ?? []);
}

describe('seriesSignatureOf — серия из сохранённых версий недели', () => {
    it('3.1, 3.2 и 3.3 — одна серия от 25.06.2026', () => {
        expect([V31, V32, V33].map(seriesSignatureOf)).toEqual([
            AI_ANALYSIS_SERIES_START,
            AI_ANALYSIS_SERIES_START,
            AI_ANALYSIS_SERIES_START,
        ]);
    });

    it('неполный, чужой и пустой набор — серии нет (null)', () => {
        expect(seriesSignatureOf({ prompt: V33.prompt })).toBeNull();
        expect(seriesSignatureOf(null)).toBeNull();
        expect(seriesSignatureOf('focus-v3.3-2026-11-17')).toBeNull();
        expect(seriesSignatureOf({ ...V33, prompt: 42 })).toBeNull();
    });
});

describe('weekSeriesOf — разрыв ряда по серии версий', () => {
    it('недели на 3.1 → 3.2 → 3.3 подряд — ряд не рвётся', () => {
        expect(
            qualityBreak([
                weekPayload(6, V31),
                weekPayload(6.2, V31),
                weekPayload(6.1, V32),
                weekPayload(6.3, V33),
                weekPayload(6.4, V33),
            ]),
        ).toBe(0);
    });

    it('версия промпта без записи в таблице серий — ряд рвётся на ней', () => {
        expect(
            qualityBreak([
                weekPayload(6, V32),
                weekPayload(6.2, V33),
                weekPayload(6.1, { ...V33, prompt: 'focus-v4.0-2026-11-24' }),
                weekPayload(6.3, { ...V33, prompt: 'focus-v4.0-2026-11-24' }),
            ]),
        ).toBe(2);
    });

    it('классификатор и атрибуция из таблиц серий ряд не рвут, вне таблиц — рвут', () => {
        expect(
            qualityBreak([
                weekPayload(6, { ...V31, classifier: '2026-09-05' }),
                weekPayload(6.2, V31),
            ]),
        ).toBe(0);
        expect(
            qualityBreak([
                weekPayload(6, V33),
                weekPayload(6.2, { ...V33, attribution: '2026-12-05' }),
            ]),
        ).toBe(1);
    });

    it('рубрика и хэш реестра ряд не рвут — как граница сравнимости витрины', () => {
        expect(
            qualityBreak([
                weekPayload(6, { ...V31, rubric: 'sections-7-v1' }),
                weekPayload(6.2, { ...V31, registry: 'builtin' }),
                weekPayload(6.1, V31),
            ]),
        ).toBe(0);
    });

    it('неделя без версий ряд не рвёт', () => {
        expect(
            qualityBreak([
                weekPayload(6, V32),
                weekPayload(6.2, null),
                weekPayload(6.1, V33),
            ]),
        ).toBe(0);
    });

    it('старый снимок со versionsMixed: true из сырого сравнения ряд не портит', () => {
        expect(
            qualityBreak([
                weekPayload(6, V31),
                { ...weekPayload(6.2, V32), versionsMixed: true },
                weekPayload(6.1, V33),
            ]),
        ).toBe(0);
    });
});
