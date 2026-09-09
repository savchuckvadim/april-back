/**
 * Цели руководителя для месячного снапшота (план Фазы 2, §3.1: поле
 * `planSnapshot` записи `ai-analytics-manager-month`).
 *
 * Снимок планов делает шаг `plans` — но только тиком 1-го числа, а месяц
 * пишется каждую ночь и догоняется backfill'ом. Поэтому источник целей
 * двойной: шина того же прогона (1-е число) либо записанный снапшот
 * `ai-analytics-plan` нужного месяца. Без второго источника поле месяца
 * оставалось бы пустым все дни, кроме первого, и витрина сравнивала бы
 * факт не с целью, а с ничем.
 *
 * Разбор чужой формы — общий `readPlans` (структурно, без импорта файлов
 * потока планов): неполная запись деградирует до пустой карты, а не роняет
 * прогон (штатная деградация §5.4).
 */
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import { readPlans } from '../domain/assembler/bus-facts.util';
import type { ManagerPlanSnapshot } from '../domain/assembler/manager-snapshot.types';
import type { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';

/** Цели менеджеров по месяцу: 'YYYY-MM' → managerId → цели. */
export type PlansByMonth = ReadonlyMap<
    string,
    ReadonlyMap<string, ManagerPlanSnapshot>
>;

/** Месяц без снятых целей: карта пуста, поле снапшота станет null. */
export const NO_PLANS: ReadonlyMap<string, ManagerPlanSnapshot> = new Map();

/** Стор снапшотов в объёме, нужном чтению планов (для тестов без Nest). */
type PlanSnapshotReader = Pick<AiAnalyticsSnapshotStore, 'findByKeys'>;

export interface PlansByMonthInput {
    domain: string;
    /** Месяц прогона: только для него в шине может лежать свежий снимок. */
    monthKey: string;
    /** Месяцы, которые пишет шаг (backfill — до трёх за ночь). */
    months: readonly string[];
    /** Значение шины под ключом `plans` (шаг планов того же прогона). */
    fromBus: unknown;
}

/**
 * Цели по месяцам: свежий снимок из шины кладётся на месяц прогона,
 * остальные месяцы читаются одним запросом снапшотов `ai-analytics-plan`.
 */
export async function plansByMonth(
    snapshots: PlanSnapshotReader,
    input: PlansByMonthInput,
): Promise<PlansByMonth> {
    const byMonth = new Map<string, ReadonlyMap<string, ManagerPlanSnapshot>>();
    const bus = readPlans(input.fromBus);
    if (bus.size > 0) byMonth.set(input.monthKey, bus);
    const missing = input.months.filter(month => !byMonth.has(month));
    if (missing.length === 0) return byMonth;
    const records = await snapshots.findByKeys(
        input.domain,
        AI_ANALYTICS_SNAPSHOT_TYPE.plan,
        { periodKeys: missing },
    );
    for (const record of records) {
        if (byMonth.has(record.periodKey)) continue;
        byMonth.set(record.periodKey, readPlans(record.payload));
    }
    return byMonth;
}
