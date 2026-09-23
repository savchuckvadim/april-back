import { registryDefault } from '@lib/sales-ai-analytics';
import { AiManagerRowDto } from '../dto/ai-manager-row.dto';
import {
    monthAnalyzed,
    monthQuality,
    toYoyBlock,
    yoyPair,
    type YoyMonthView,
} from '../domain/presenter/yoy.presenter';
import {
    baseDepartmentOf,
    buildOverviewYoy,
    mergeMonths,
    yoyForRow,
} from '../domain/presenter/yoy-rows.presenter';
import type { OverviewYoySnapshots } from '../domain/loaders/overview-snapshots.loader';

/**
 * Блок «год назад» витрины (план Фазы 3, П3): величины двух месяцев
 * рядом, отказ без истории M−12 и при `n < n_min_none`, флаг
 * сопоставимости по решению владельца В9 (другой уровень год назад —
 * сравнение с тем же менеджером, `comparable: false`).
 *
 * Ожидания считаются формулой от фикстуры, а не переписаны числом.
 */
const N_MIN_NONE = registryDefault('n_min_none');

/** Месяц менеджера в объёме, который читает витрина. */
function month(options: {
    types: readonly { n: number; score: number }[];
    salesSum?: number;
    salesCount?: number;
    level?: string;
    tenureBand?: string;
    versions?: string;
    departmentId?: number;
}): YoyMonthView {
    return {
        byType: options.types.map((item, index) => ({
            callType: `type-${index}`,
            n: item.n,
            score: {
                value: item.score,
                n: item.n,
                confidence: { level: 'ok' },
            },
        })),
        finance: {
            salesSum: options.salesSum ?? 0,
            salesCount: options.salesCount ?? 0,
            averageCheck:
                (options.salesCount ?? 0) > 0
                    ? (options.salesSum ?? 0) / (options.salesCount ?? 1)
                    : null,
        },
        ...(options.level === undefined ? {} : { level: options.level }),
        passport: {
            ...(options.tenureBand === undefined
                ? {}
                : { tenureBand: options.tenureBand }),
            ...(options.departmentId === undefined
                ? {}
                : { departmentId: options.departmentId }),
        },
        meta: { paramsVersion: options.versions ?? 'pv-1' },
    };
}

/** Месяц с объёмом выше порога показа и известной средней оценкой. */
const CURRENT = month({
    types: [
        { n: N_MIN_NONE * 2, score: 8 },
        { n: N_MIN_NONE * 2, score: 6 },
    ],
    salesSum: 900_000,
    salesCount: 9,
    level: 'middle',
    tenureBand: '6-18',
});

const BASE = month({
    types: [
        { n: N_MIN_NONE, score: 6 },
        { n: N_MIN_NONE * 3, score: 5 },
    ],
    salesSum: 400_000,
    salesCount: 8,
    level: 'middle',
    tenureBand: '6-18',
});

const OPTIONS = { periodKey: '2026-09' } as const;

describe('monthQuality / monthAnalyzed', () => {
    it('оценка месяца — среднее по типам, взвешенное объёмом', () => {
        const expected =
            (8 * N_MIN_NONE * 2 + 6 * N_MIN_NONE * 2) / (N_MIN_NONE * 4);
        expect(monthQuality(CURRENT).value).toBeCloseTo(expected, 10);
        expect(monthQuality(CURRENT).n).toBe(N_MIN_NONE * 4);
        expect(monthAnalyzed(CURRENT)).toBe(N_MIN_NONE * 4);
    });

    it('типы без значения в среднее не входят («мало данных» — не ноль)', () => {
        const view: YoyMonthView = {
            byType: [
                { callType: 'a', n: N_MIN_NONE * 3, score: { value: 7 } },
                { callType: 'b', n: 2, score: { value: null } },
            ],
        };
        expect(monthQuality(view).value).toBeCloseTo(7, 10);
        expect(monthQuality(view).n).toBe(N_MIN_NONE * 3);
    });

    it('месяца нет либо форма чужая: значения нет, объём ноль', () => {
        expect(monthQuality(null).value).toBeNull();
        expect(monthQuality({ byType: 'не массив' }).value).toBeNull();
        expect(monthAnalyzed(null)).toBe(0);
    });
});

describe('toYoyBlock — когда блока нет', () => {
    it('период не месяц: блок null', () => {
        expect(toYoyBlock(CURRENT, BASE, { periodKey: '2026-W38' })).toBeNull();
        expect(
            toYoyBlock(CURRENT, BASE, { ...OPTIONS, grain: 'week' }),
        ).toBeNull();
    });

    it('истории M−12 нет: блок null, ни одного числа (приёмка П3)', () => {
        expect(toYoyBlock(CURRENT, null, OPTIONS)).toBeNull();
    });

    it('в обоих периодах разборов меньше n_min_none: блок null', () => {
        const thin = month({ types: [{ n: N_MIN_NONE - 1, score: 7 }] });
        expect(toYoyBlock(thin, thin, OPTIONS)).toBeNull();
    });
});

describe('toYoyBlock — содержимое', () => {
    it('пара ключей, сопоставимость и разницы величин', () => {
        const block = toYoyBlock(CURRENT, BASE, OPTIONS);
        expect(block).not.toBeNull();
        expect(block?.periodKey).toBe('2026-09');
        expect(block?.basePeriodKey).toBe('2025-09');
        expect(block?.comparable).toBe(true);
        expect(block?.reasons).toEqual([]);
        const quality = block?.metrics.find(item => item.metric === 'quality');
        expect(quality?.delta).toBeCloseTo(
            (monthQuality(CURRENT).value ?? 0) -
                (monthQuality(BASE).value ?? 0),
            10,
        );
        const analyzed = block?.metrics.find(
            item => item.metric === 'analyzed_calls',
        );
        expect(analyzed?.current.value).toBe(monthAnalyzed(CURRENT));
        expect(analyzed?.base.value).toBe(monthAnalyzed(BASE));
        expect(analyzed?.delta).toBe(
            monthAnalyzed(CURRENT) - monthAnalyzed(BASE),
        );
    });

    it('финансовые величины идут из нагрузки месяца', () => {
        const block = toYoyBlock(CURRENT, BASE, OPTIONS);
        const sum = block?.metrics.find(item => item.metric === 'sales_sum');
        expect(sum?.current.value).toBe(900_000);
        expect(sum?.base.value).toBe(400_000);
        expect(sum?.delta).toBe(500_000);
        const check = block?.metrics.find(
            item => item.metric === 'average_check',
        );
        expect(check?.current.value).toBeCloseTo(900_000 / 9, 10);
        expect(check?.base.value).toBeCloseTo(400_000 / 8, 10);
    });

    it('сделок меньше порога показа: величины продаж без чисел', () => {
        const thinSales = month({
            types: [{ n: N_MIN_NONE * 4, score: 7 }],
            salesSum: 100_000,
            salesCount: 1,
        });
        const block = toYoyBlock(thinSales, thinSales, OPTIONS);
        const sum = block?.metrics.find(item => item.metric === 'sales_sum');
        expect(sum).toBeUndefined();
    });

    it('смена уровня: числа есть, но comparable false с причиной (В9)', () => {
        const base = month({
            types: [{ n: N_MIN_NONE * 4, score: 5 }],
            level: 'junior',
            tenureBand: '6-18',
        });
        const block = toYoyBlock(CURRENT, base, OPTIONS);
        expect(block?.comparable).toBe(false);
        expect(block?.reasons).toEqual(['level-changed']);
        expect(
            block?.metrics.find(item => item.metric === 'quality')?.base.value,
        ).toBeCloseTo(5, 10);
    });

    it('смена версий разбора: comparable false, причина versions-changed', () => {
        const base = month({
            types: [{ n: N_MIN_NONE * 4, score: 5 }],
            level: 'middle',
            tenureBand: '6-18',
            versions: 'pv-0',
        });
        expect(toYoyBlock(CURRENT, base, OPTIONS)?.reasons).toEqual([
            'versions-changed',
        ]);
    });

    it('смена отдела между периодами — оговорка пары, а не подмена менеджера', () => {
        const pair = yoyPair(CURRENT, BASE, {
            ...OPTIONS,
            departmentId: 41,
            baseDepartmentId: 37,
        });
        expect(pair.available).toBe(true);
        expect(pair.comparable).toBe(false);
        expect(pair.reasons).toEqual(['department-changed']);
        expect(pair.basePeriodKey).toBe('2025-09');
    });
});

describe('yoyForRow / buildOverviewYoy', () => {
    const row = (managerId: string, departmentId: number): AiManagerRowDto =>
        ({ managerId, departmentId }) as AiManagerRowDto;

    const snapshots = (
        months: Record<string, YoyMonthView>,
        baseMonths: Record<string, YoyMonthView>,
    ): OverviewYoySnapshots => ({
        monthKey: '2026-09',
        baseMonthKey: '2025-09',
        months: new Map(Object.entries(months)),
        baseMonths: new Map(Object.entries(baseMonths)),
    });

    it('без контекста «год назад» блок строки остаётся null', () => {
        expect(yoyForRow(row('512', 37), {})).toBeNull();
    });

    it('отдел год назад читается из паспорта месяца, когда он там есть', () => {
        const base = month({
            types: [{ n: N_MIN_NONE * 4, score: 5 }],
            departmentId: 37,
        });
        expect(baseDepartmentOf(base)).toBe(37);
        expect(baseDepartmentOf(BASE)).toBeNull();
        const block = yoyForRow(row('512', 41), {
            yoy: snapshots({ '512': CURRENT }, { '512': base }),
        });
        expect(block?.reasons).toContain('department-changed');
    });

    it('сложение месяцев отдела: объёмы и суммы складываются, чек — производная', () => {
        const merged = mergeMonths([CURRENT, BASE]);
        expect(monthAnalyzed(merged)).toBe(
            monthAnalyzed(CURRENT) + monthAnalyzed(BASE),
        );
        const finance = merged.finance as {
            salesSum: number;
            salesCount: number;
            averageCheck: number | null;
        };
        expect(finance.salesSum).toBe(900_000 + 400_000);
        expect(finance.salesCount).toBe(9 + 8);
        expect(finance.averageCheck).toBeCloseTo(1_300_000 / 17, 10);
    });

    it('итог обзора складывает только менеджеров периметра', () => {
        const other = month({
            types: [{ n: N_MIN_NONE * 10, score: 1 }],
            salesSum: 10,
            salesCount: 10,
        });
        const block = buildOverviewYoy([row('512', 37)], {
            yoy: snapshots(
                { '512': CURRENT, '777': other },
                { '512': BASE, '777': other },
            ),
        });
        expect(
            block?.metrics.find(item => item.metric === 'analyzed_calls')
                ?.current.value,
        ).toBe(monthAnalyzed(CURRENT));
    });

    it('никого из периметра в месяцах нет — итога обзора нет', () => {
        expect(
            buildOverviewYoy([row('999', 37)], {
                yoy: snapshots({ '512': CURRENT }, { '512': BASE }),
            }),
        ).toBeNull();
    });
});
