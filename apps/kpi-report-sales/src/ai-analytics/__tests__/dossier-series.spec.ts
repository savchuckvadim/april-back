import { toPortalDate } from '@lib/sales-ai-analytics';
import {
    analyzedOf,
    nBeforeComparableOf,
    scoreOfPeriod,
    toSeries,
} from '../domain/assembler/dossier-series';
import { windowAnalyzed } from '../domain/assembler/dossier-sections';
import {
    legacyMetric,
    type DossierSnapshotView,
} from '../domain/assembler/dossier.reader';
import { buildManagerWeekPayload } from '../domain/assembler/manager-week.assembler';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { isoWeekKey } from '../domain/loaders/period.util';
import {
    DOSSIER_MONTH_META,
    legacyMonthPayload,
    monthCalls,
    realMonthPayload,
} from './fixtures/dossier-month.fixture';
import { liteRow } from './fixtures/lite-row.fixture';

/**
 * Ряды досье на настоящих нагрузках сборщиков недели и месяца (30.09.2026):
 * ряд «Месяцы» раньше показывал 0 разборов у всех — месячный снапшот не
 * писал n и score, а спеки подавали выдуманную нагрузку с этими полями.
 */
const MANAGER = '512';
const TZ = 'Europe/Moscow';
const MONTH = '2026-09';
/** Разрыв ряда настройками: 1 и 2 сентября — до границы. */
const COMPARABLE_FROM = '2026-09-03';

/**
 * Сентябрь менеджера: 20 презентаций с баллом 70 (1–20 сентября), звонок
 * «прочее» 15-го и презентация без балла 16-го — они в n, но не в оценке.
 */
function septemberRows(): DatedLiteRow[] {
    const extra = (
        id: string,
        day: string,
        patch: Partial<DatedLiteRow>,
    ): DatedLiteRow =>
        liteRow({
            transcriptionId: id,
            managerId: MANAGER,
            callStartedAt: new Date(`${day}T09:00:00Z`),
            ...patch,
        }) as DatedLiteRow;

    return [
        ...monthCalls(MANAGER, MONTH, 20),
        extra('other-15', '2026-09-15', { callType: 'other' }),
        extra('no-score-16', '2026-09-16', { score: null }),
    ];
}

const view = (periodKey: string, payload: unknown): DossierSnapshotView => ({
    id: `ais-${periodKey}`,
    periodKey,
    managerId: MANAGER,
    payload,
    generatedAt: '2026-09-30T01:00:00.000Z',
});

/** Недели сентября тем же сборщиком, что у конвейера (по ISO-неделе в TZ). */
function weekViews(rows: readonly DatedLiteRow[]): DossierSnapshotView[] {
    const byWeek = new Map<string, DatedLiteRow[]>();
    for (const row of rows) {
        const key = isoWeekKey(toPortalDate(row.callStartedAt, TZ));
        byWeek.set(key, [...(byWeek.get(key) ?? []), row]);
    }
    return [...byWeek.entries()].flatMap(([weekKey, weekRows]) =>
        buildManagerWeekPayload({
            weekKey,
            rows: weekRows,
            scoring: { caps: [], stopWords: [] },
            comparableFrom: COMPARABLE_FROM,
            timeZone: TZ,
            meta: DOSSIER_MONTH_META,
        }).rows.map(row => view(weekKey, row.payload)),
    );
}

const monthView = (rows: readonly DatedLiteRow[]): DossierSnapshotView =>
    view(
        MONTH,
        realMonthPayload(MANAGER, MONTH, rows, {
            comparableFrom: COMPARABLE_FROM,
            timeZone: TZ,
        }),
    );

describe('Ряды досье на настоящих нагрузках недели и месяца', () => {
    const rows = septemberRows();
    const series = toSeries(weekViews(rows), [monthView(rows)]);

    it('ряд «Месяцы»: разборы месяца не 0 — объём и оценка из снапшота месяца', () => {
        const [month] = series?.months ?? [];

        expect(month).toMatchObject({
            periodKey: MONTH,
            n: 20,
            nBeforeComparable: 2,
        });
        // 18 презентаций с баллом с 3 сентября: «прочее» и без балла — вне оценки.
        expect(month.score).toMatchObject({
            value: 7,
            n: 18,
            confidence: { level: 'low' },
        });
        // У месяца признака смешанных версий нет — поле не отдаётся.
        expect(month).not.toHaveProperty('versionsMixed');
    });

    it('сумма недель сходится с месяцем: и разборы, и разборы до границы', () => {
        const weeks = series?.weeks ?? [];
        const month = series?.months[0];

        expect(weeks.map(week => week.periodKey)).toEqual([
            '2026-W36',
            '2026-W37',
            '2026-W38',
        ]);
        expect(weeks.map(week => week.n)).toEqual([4, 7, 9]);
        expect(weeks.reduce((sum, week) => sum + week.n, 0)).toBe(month?.n);
        expect(
            weeks.reduce((sum, week) => sum + week.nBeforeComparable, 0),
        ).toBe(month?.nBeforeComparable);
        expect(
            weeks.every(week => typeof week.versionsMixed === 'boolean'),
        ).toBe(true);
    });

    it('«N разборов, оценка мало данных» — разные счётчики: оценённых меньше, чем разобранных', () => {
        const w38 = series?.weeks.find(week => week.periodKey === '2026-W38');

        expect(w38?.n).toBe(9);
        expect(w38?.score).toEqual({
            value: null,
            n: 7,
            confidence: { level: 'none', reason: 'not-enough-data' },
        });
    });

    it('объём окна для трендов — тот же, что в ряду «Месяцы»', () => {
        const month = monthView(rows);

        expect(windowAnalyzed([month])).toBe(20);
        expect(windowAnalyzed([month])).toBe(analyzedOf(month.payload));
    });
});

describe('Месяц старого расчёта (до 30.09.2026, без n и score)', () => {
    const rows = septemberRows();
    const legacy = legacyMonthPayload(
        realMonthPayload(MANAGER, MONTH, rows, {
            comparableFrom: COMPARABLE_FROM,
            timeZone: TZ,
        }),
    );

    it('объём — сумма byType[].n, оценка — пустая с причиной legacy-snapshot', () => {
        const [point] = toSeries([], [view(MONTH, legacy)])?.months ?? [];

        expect(point).toEqual({
            periodKey: MONTH,
            n: 20,
            nBeforeComparable: 0,
            score: legacyMetric(),
        });
        expect(windowAnalyzed([view(MONTH, legacy)])).toBe(20);
    });

    it('чужая форма нагрузки: 0 разборов и пустая оценка без выдуманных чисел', () => {
        expect(analyzedOf('мусор')).toBe(0);
        expect(analyzedOf({ byType: [{ n: 'пять' }, null] })).toBe(0);
        expect(nBeforeComparableOf(null)).toBe(0);
        expect(scoreOfPeriod({ score: { value: 5 } })).toEqual({
            value: null,
            n: 0,
            confidence: { level: 'none' },
        });
    });
});
