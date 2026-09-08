/**
 * Снимок планов руководителя 1-го числа (план Фазы 2, поток 14a; план 4.9
 * «цель G: план руководителя → override → цель уровня → медиана полосы»).
 *
 * Цели живут в UF-полях сотрудника и меняются в любой день, поэтому месяц
 * фиксируется снимком: цель месяца не переезжает задним числом, а история
 * планов копится сама (код реестра `plan_snapshot_history`). Повторный тик
 * снимок НЕ перезаписывает — иначе правка плана 20-го числа переписала бы
 * цель, по которой месяц уже считался.
 *
 * Санити цели: если за окно фактов план выполняют меньше трети сотрудников,
 * снимок несёт флаг «план = пожелание» — это не оценка людей, а сообщение
 * руководителю, что цель не связана с фактом.
 *
 * `@Injectable` без bitrix-состояния: планы читает PlansLoader (инстанс
 * Битрикс берётся на вызов через PBXService.init → new PlanTargetsService).
 */
import { Injectable, Logger } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import type { ManagerPlanTarget, PlanSnapshot } from '@lib/sales-ai-analytics';
import { previousMonthKey } from '../../constants/ai-snapshot.const';
import {
    AI_PLANS_SKIP_REASONS,
    AI_PLANS_WISH,
    AI_PLANS_WISH_REASONS,
} from '../../constants/ai-passport.const';
import { PlansLoader } from '../loaders/plans.loader';
import type { AiPlanManagerTargets } from '../loaders/plans.types';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';

/** Месяц менеджера в окне санити: план месяца и факт продаж. */
export interface PlanCheckRow {
    managerId: string;
    monthKey: string;
    /** Факт продаж месяца. */
    sales: number;
    /** План месяца; null — плана не было (месяц в санити не участвует). */
    target: number | null;
}

/** Итог санити цели: доля выполняющих и флаг «пожелание». */
export interface PlanWishResult {
    achieversShare: number | null;
    factManagers: number;
    planIsWish: boolean;
    reason: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;

/** Факт продаж менеджер-месяца из нагрузки снапшота; чужая форма → null. */
export function monthSalesOf(payload: unknown): number | null {
    const finance = asRecord(asRecord(payload)?.finance);
    const sales = finance?.salesCount;

    return typeof sales === 'number' && Number.isFinite(sales) ? sales : null;
}

/** Цели менеджеров из нагрузки прошлого снимка планов. */
export function planTargetsOf(payload: unknown): ManagerPlanTarget[] {
    const managers = asRecord(payload)?.managers;
    if (!Array.isArray(managers)) return [];

    return managers.flatMap((item: unknown) => {
        const row = asRecord(item);
        return row && typeof row.managerId === 'string'
            ? [row as unknown as ManagerPlanTarget]
            : [];
    });
}

/** Ключи трёх месяцев, предшествующих месяцу снимка. */
export function factMonthKeys(monthKey: string, count: number): string[] {
    const keys: string[] = [];
    let cursor = monthKey;
    for (let index = 0; index < count; index += 1) {
        cursor = previousMonthKey(`${cursor}-01`);
        keys.push(cursor);
    }

    return keys.reverse();
}

/**
 * Доля выполняющих план: менеджер засчитан, если закрыл план не меньше чем
 * в половине своих месяцев окна. Меньше трёх менеджеров с планом и фактом —
 * доля не считается: на двух наблюдениях «треть» ничего не значит.
 */
export function planWish(rows: readonly PlanCheckRow[]): PlanWishResult {
    const byManager = new Map<string, { months: number; achieved: number }>();
    for (const row of rows) {
        if (row.target === null || row.target <= 0) continue;
        const stat = byManager.get(row.managerId) ?? { months: 0, achieved: 0 };
        stat.months += 1;
        if (row.sales >= row.target) stat.achieved += 1;
        byManager.set(row.managerId, stat);
    }
    const managers = [...byManager.values()];
    if (managers.length < AI_PLANS_WISH.minManagers) {
        return {
            achieversShare: null,
            factManagers: managers.length,
            planIsWish: false,
            reason: rows.length
                ? AI_PLANS_WISH_REASONS.noTargets
                : AI_PLANS_WISH_REASONS.noFacts,
        };
    }
    const achievers = managers.filter(
        stat => stat.achieved / stat.months >= AI_PLANS_WISH.monthsShare,
    ).length;
    const achieversShare = achievers / managers.length;

    return {
        achieversShare,
        factManagers: managers.length,
        planIsWish: achieversShare < AI_PLANS_WISH.share,
        reason: null,
    };
}

/** Цели загрузчика → запись снимка (каталог показателей целиком). */
export function toPlanTarget(row: AiPlanManagerTargets): ManagerPlanTarget {
    return {
        managerId: String(row.managerId),
        sales: row.sales,
        calls: row.calls,
        presentations: row.presentations,
        targets: { ...row.targets },
    };
}

/** Что нужно снимку планов от прогона конвейера. */
export interface PlansSnapshotInput {
    domain: string;
    /** Месяц снимка 'YYYY-MM'. */
    monthKey: string;
    /** День снятия 'YYYY-MM-DD' в TZ портала. */
    day: string;
    managerIds: readonly number[];
    calcVersion: string;
    paramsVersion: string;
    inputsHash: string;
    /** Момент прогона ISO (время параметром, не `new Date()` внутри). */
    generatedAt: string;
    now: Date;
    /** Перезаписать снимок месяца (ручной пересчёт). */
    forceRefresh?: boolean;
}

/** Итог шага: снимок, число записей и причина пропуска. */
export interface PlansSnapshotResult {
    snapshot: PlanSnapshot | null;
    written: number;
    bitrixCalls: number;
    skipped: string | null;
}

@Injectable()
export class PlansSnapshotUseCase {
    private readonly logger = new Logger(PlansSnapshotUseCase.name);

    constructor(
        private readonly plans: PlansLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    /** Снять цели месяца и записать снимок (повтор — без перезаписи). */
    async capture(input: PlansSnapshotInput): Promise<PlansSnapshotResult> {
        if (!input.managerIds.length) {
            return skip(AI_PLANS_SKIP_REASONS.noRoster);
        }
        const existing = await this.existing(input);
        if (existing && !input.forceRefresh) {
            return {
                snapshot: existing,
                written: 0,
                bitrixCalls: 0,
                skipped: AI_PLANS_SKIP_REASONS.alreadyCaptured,
            };
        }
        const loaded = await this.plans.loadPlans(
            input.domain,
            input.managerIds,
            { forceRefresh: true },
        );
        if (!loaded.ok) {
            this.logger.warn(
                `Снимок планов ${input.domain} ${input.monthKey} не сделан: ` +
                    `${loaded.error ?? 'портал не ответил'}`,
            );
            return skip(AI_PLANS_SKIP_REASONS.notRead);
        }
        const managers = loaded.managers.map(toPlanTarget);
        const snapshot: PlanSnapshot = {
            monthKey: input.monthKey,
            takenOn: input.day,
            managers,
            factMonths: factMonthKeys(input.monthKey, AI_PLANS_WISH.factMonths),
            ...(await this.wish(input, managers)),
        };
        await this.snapshots.upsert<PlanSnapshot>({
            domain: input.domain,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.plan,
            periodKey: input.monthKey,
            managerId: null,
            calcVersion: input.calcVersion,
            paramsVersion: input.paramsVersion,
            inputsHash: input.inputsHash,
            generatedAt: input.generatedAt,
            payload: snapshot,
        });

        return { snapshot, written: 1, bitrixCalls: 1, skipped: null };
    }

    /** Снимок месяца уже есть? (идемпотентность повторного тика). */
    private async existing(
        input: PlansSnapshotInput,
    ): Promise<PlanSnapshot | null> {
        const records = await this.snapshots.findByKeys(
            input.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.plan,
            { periodKeys: [input.monthKey] },
        );
        const latest = records[records.length - 1];

        return latest ? (latest.payload as PlanSnapshot) : null;
    }

    /** Санити цели по трём прошлым месяцам: факты × планы тех месяцев. */
    private async wish(
        input: PlansSnapshotInput,
        managers: readonly ManagerPlanTarget[],
    ): Promise<PlanWishResult> {
        const monthKeys = factMonthKeys(
            input.monthKey,
            AI_PLANS_WISH.factMonths,
        );
        const [facts, plans] = await Promise.all([
            this.snapshots.findByKeys(
                input.domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
                { periodKeys: monthKeys },
            ),
            this.snapshots.findByKeys(
                input.domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.plan,
                { periodKeys: monthKeys },
            ),
        ]);
        const targets = new Map<string, number | null>();
        for (const manager of managers) {
            for (const monthKey of monthKeys) {
                targets.set(`${manager.managerId}|${monthKey}`, manager.sales);
            }
        }
        for (const record of plans) {
            for (const target of planTargetsOf(record.payload)) {
                targets.set(
                    `${target.managerId}|${record.periodKey}`,
                    target.sales,
                );
            }
        }

        return planWish(
            facts.flatMap(record => {
                const sales = monthSalesOf(record.payload);
                if (sales === null || !record.managerId) return [];
                return [
                    {
                        managerId: record.managerId,
                        monthKey: record.periodKey,
                        sales,
                        target:
                            targets.get(
                                `${record.managerId}|${record.periodKey}`,
                            ) ?? null,
                    },
                ];
            }),
        );
    }
}

/** Пропуск шага: снимок не пишется, причина уезжает в журнал прогона. */
function skip(reason: string): PlansSnapshotResult {
    return { snapshot: null, written: 0, bitrixCalls: 0, skipped: reason };
}
