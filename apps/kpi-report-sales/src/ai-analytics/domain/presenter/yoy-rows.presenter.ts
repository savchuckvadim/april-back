/**
 * Блок «год назад» в обзоре (план Фазы 3, П3): строка менеджера и итог
 * периметра. Расчёт самой пары периодов и величин — в `yoy.presenter.ts`;
 * здесь только раскладка месяцев M и M−12 по строкам и складывание
 * месяцев периметра в один «месяц отдела».
 *
 * Вынесено из `overview-phase2.presenter.ts` по лимиту 300 строк.
 * Чистые функции.
 */
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import type { AiYoyDto } from '../../dto/ai-yoy.dto';
import type { OverviewYoySnapshots } from '../loaders/overview-snapshots.loader';
import { toYoyBlock, type YoyMonthView } from './yoy.presenter';

/** Контекст блока «год назад»: месяцы пары и граница сравнимой истории. */
export interface YoyContext {
    /** Месяцы менеджеров M и M−12; нет — блока нет. */
    yoy?: OverviewYoySnapshots;
    /** `comparableFrom` периода; пусто — ряд не рвался. */
    comparableFrom?: string | null;
}

/**
 * Отдел менеджера год назад из нагрузки месяца. Сегодня `manager-month`
 * отдел не пишет (его нет ни в `ManagerPassportFacts`, ни в корне
 * нагрузки — `manager-snapshot.types.ts`), поэтому значение почти всегда
 * `null`, и причина `department-changed` не выставляется: неизвестное —
 * не «сменился». Читается структурно, чтобы заработать само, когда
 * паспорт начнёт писать отдел; до тех пор смена отдела за год остаётся
 * незамеченной — это долг шага паспорта, а не повод выдумывать значение.
 */
export function baseDepartmentOf(month: YoyMonthView | null): number | null {
    const passport = month?.passport;
    const value =
        typeof passport === 'object' && passport !== null
            ? (passport as { departmentId?: unknown }).departmentId
            : undefined;

    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Блок «год назад» строки: месяц окончания периода против того же месяца
 * годом ранее. Отдел «сейчас» берётся из самой строки, отдел «год назад» —
 * из снапшота M−12: смена отдела делает пару несопоставимой, но сравнение
 * идёт с тем же менеджером (решение владельца В9 от 22.09.2026).
 */
export function yoyForRow(
    row: AiManagerRowDto,
    ctx: YoyContext,
): AiYoyDto | null {
    if (ctx.yoy === undefined) return null;
    const base = ctx.yoy.baseMonths.get(row.managerId) ?? null;

    return toYoyBlock(ctx.yoy.months.get(row.managerId) ?? null, base, {
        periodKey: ctx.yoy.monthKey,
        departmentId: row.departmentId,
        baseDepartmentId: baseDepartmentOf(base),
        comparableFrom: ctx.comparableFrom ?? null,
    });
}

/** Факт по типу звонка в «месяце отдела»: объём и средняя оценка. */
interface MergedTypeFact {
    callType: string;
    n: number;
    score: { value: number };
}

/** Неотрицательное число из чужой нагрузки; иначе null. */
function numberOf(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Факты по типам одного месяца, годные для складывания. */
function typeFactsOf(month: YoyMonthView): MergedTypeFact[] {
    const list = Array.isArray(month.byType) ? month.byType : [];

    return list.flatMap((item): MergedTypeFact[] => {
        const fact = item as {
            callType?: unknown;
            n?: unknown;
            score?: { value?: unknown };
        };
        const n = numberOf(fact.n);
        const value = numberOf(fact.score?.value);
        if (n === null || n <= 0 || value === null) return [];
        const callType = typeof fact.callType === 'string' ? fact.callType : '';

        return [{ callType, n, score: { value } }];
    });
}

/**
 * Месяцы менеджеров в один месяц отдела: факты по типам складываются как
 * есть (среднюю оценку взвешивает по объёму сам `yoy.presenter`), суммы
 * финансов складываются, а средний чек пересчитывается из суммы и числа
 * сделок — среднее средних чеков дало бы другое число.
 */
export function mergeMonths(months: readonly YoyMonthView[]): YoyMonthView {
    const byType: MergedTypeFact[] = [];
    let salesSum = 0;
    let salesCount = 0;
    for (const month of months) {
        byType.push(...typeFactsOf(month));
        const finance = month.finance as
            | { salesSum?: unknown; salesCount?: unknown }
            | undefined;
        salesSum += numberOf(finance?.salesSum) ?? 0;
        salesCount += numberOf(finance?.salesCount) ?? 0;
    }

    return {
        byType,
        finance: {
            salesSum,
            salesCount,
            averageCheck: salesCount > 0 ? salesSum / salesCount : null,
        },
        meta: months[0]?.meta,
    };
}

/**
 * Блок «год назад» всего обзора: месяцы менеджеров периметра
 * складываются в один «месяц отдела». Состав сравнивается только по
 * версиям разбора: отдела, уровня и полосы стажа у отдела как целого
 * нет, и приписывать их ему нельзя.
 *
 * `null` — сравнивать нечего: снапшотов M−12 нет, период обзора не месяц
 * либо разборов в обоих периодах меньше `n_min_none` (ни одного числа).
 */
export function buildOverviewYoy(
    rows: readonly AiManagerRowDto[],
    ctx: YoyContext,
): AiYoyDto | null {
    if (ctx.yoy === undefined) return null;
    const ids = rows.map(row => row.managerId);
    const merge = (
        source: ReadonlyMap<string, YoyMonthView>,
    ): YoyMonthView | null => {
        const months = ids.flatMap(id => source.get(id) ?? []);

        return months.length === 0 ? null : mergeMonths(months);
    };

    return toYoyBlock(merge(ctx.yoy.months), merge(ctx.yoy.baseMonths), {
        periodKey: ctx.yoy.monthKey,
        comparableFrom: ctx.comparableFrom ?? null,
    });
}
