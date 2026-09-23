/**
 * Сборка входа реконсиляции план-факт (план Фазы 3, поток П2): снимок
 * целей руководителя (`ai-analytics-plan`) × месяцы менеджеров
 * (`ai-analytics-manager-month`) × рабочий календарь портала →
 * `PlanFactInput` по каждому менеджеру и свод отдела.
 *
 * План берётся ТОЛЬКО из снимка `plan` (решение владельца В6 от
 * 22.09.2026): денежного плана нет, поэтому и денежных показателей в
 * реконсиляции нет. Факт берётся из уже посчитанных месячных снапшотов —
 * поэтому закрытый месяц читается без единого обращения к Битриксу.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()` внутри.
 */
import {
    isWorkday,
    reconcile,
    reconcileTeam,
    shiftDate,
    type ManagerPlanTarget,
    type PlanFactExposure,
    type PlanFactInput,
    type PlanFactRow,
    type PlanFactTargets,
    type PlanFactValues,
    type PlanSnapshot,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { workdaysInMonth } from '../loaders/calendar.util';
import type { ManagerMonthPayload } from './manager-snapshot.types';

/** Максимум дней перебора месяца (страховка от кривого monthKey). */
const MAX_MONTH_DAYS = 31;

/** Один менеджер реконсиляции: вход модели и его исходные снапшоты. */
export interface PlanFactManagerInput extends PlanFactInput {
    readonly managerId: string;
    /** Цели руководителя нашлись в снимке. */
    readonly hasPlan: boolean;
    /** Месяц менеджера рассчитан. */
    readonly hasFact: boolean;
}

/** Что нужно ассемблеру от ручки. */
export interface PlanFactBuildInput {
    readonly monthKey: string;
    /** Менеджеры в порядке витрины (уже отфильтрованы периметром). */
    readonly managerIds: readonly string[];
    /** Снимок целей месяца; null — снимка нет, план пуст у всех. */
    readonly plan: PlanSnapshot | null;
    /** Месяцы менеджеров: managerId → нагрузка снапшота. */
    readonly months: ReadonlyMap<string, Partial<ManagerMonthPayload>>;
    readonly calendar: WorkCalendar;
    /** Календарная дата расчёта 'YYYY-MM-DD' в TZ портала. */
    readonly today: string;
    /** `ai_analytics_daily_plan_enabled` портала. */
    readonly dailyPlanEnabled: boolean;
    /** `plan_day_ceiling` портала; undefined — дефолт реестра. */
    readonly dayCeiling?: number;
}

/** Итог сборки: строки по менеджерам, свод отдела и экспозиция месяца. */
export interface PlanFactView {
    readonly monthKey: string;
    readonly exposure: PlanFactExposure;
    readonly managers: readonly PlanFactManagerRows[];
    readonly team: readonly PlanFactRow[];
    /** Снимок целей за месяц есть. */
    readonly hasPlanSnapshot: boolean;
    /** Хотя бы один месяц менеджера рассчитан. */
    readonly hasMonthSnapshots: boolean;
}

/** Строки одного менеджера. */
export interface PlanFactManagerRows {
    readonly managerId: string;
    readonly rows: readonly PlanFactRow[];
}

/**
 * Рабочих дней месяца, прошедших к дате `today` включительно. Месяц в
 * будущем — ноль, месяц в прошлом — весь месяц.
 */
export function workdaysElapsed(
    monthKey: string,
    today: string,
    calendar: WorkCalendar,
): number {
    const total = workdaysInMonth(monthKey, calendar);
    if (today.slice(0, 7) > monthKey) return total;
    if (today.slice(0, 7) < monthKey) return 0;
    let cursor = `${monthKey}-01`;
    let elapsed = 0;
    for (let scanned = 0; scanned < MAX_MONTH_DAYS; scanned += 1) {
        if (!cursor.startsWith(monthKey) || cursor > today) break;
        if (isWorkday(cursor, calendar)) elapsed += 1;
        cursor = shiftDate(cursor, 1);
    }

    return Math.min(total, elapsed);
}

/** Экспозиция месяца: рабочие дни, потолок дня и признак дневной разбивки. */
export function buildExposure(input: PlanFactBuildInput): PlanFactExposure {
    return {
        workdaysInMonth: workdaysInMonth(input.monthKey, input.calendar),
        workdaysElapsed: workdaysElapsed(
            input.monthKey,
            input.today,
            input.calendar,
        ),
        dailyPlanEnabled: input.dailyPlanEnabled,
        ...(input.dayCeiling === undefined
            ? {}
            : { dayCeiling: input.dayCeiling }),
    };
}

/**
 * Цели менеджера из снимка планов. В реконсиляцию идут только те три
 * показателя, которые снимок хранит отдельными полями; остальной каталог
 * `targets` — материал других ручек.
 */
export function planTargetsOf(
    target: ManagerPlanTarget | undefined,
): PlanFactTargets {
    return {
        sales: target?.sales ?? null,
        calls: target?.calls ?? null,
        presentations: target?.presentations ?? null,
    };
}

/**
 * Факт менеджера из месячного снапшота: продажи — число закрытых сделок
 * финансового хвоста, звонки и презентации — KPI-вектор месяца. Нагрузки
 * нет — все три `null` (а не нули: ноль означал бы «ничего не сделал»).
 */
export function factValuesOf(
    month: Partial<ManagerMonthPayload> | undefined,
): PlanFactValues {
    if (month === undefined) {
        return { sales: null, calls: null, presentations: null };
    }
    const kpi = month.kpi ?? {};

    return {
        sales: numberOrNull(month.finance?.salesCount),
        calls: numberOrNull(kpi.call_done),
        presentations: numberOrNull(kpi.presentation_done),
    };
}

/** Конечное число либо null (чужая форма нагрузки не роняет ручку). */
function numberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Вход модели по одному менеджеру. */
export function buildManagerInput(
    managerId: string,
    input: PlanFactBuildInput,
    exposure: PlanFactExposure,
): PlanFactManagerInput {
    const target = input.plan?.managers.find(
        item => String(Number(item.managerId)) === managerId,
    );
    const month = input.months.get(managerId);

    return {
        managerId,
        plan: planTargetsOf(target),
        fact: factValuesOf(month),
        exposure,
        hasPlan: target !== undefined,
        hasFact: month !== undefined,
    };
}

/**
 * Полная сборка: строки по менеджерам в порядке запроса и свод отдела.
 * Свод считается сложением планов и фактов менеджеров — поэтому сумма
 * `fact` строк по менеджерам равна факту отдела по построению.
 */
export function buildPlanFactView(input: PlanFactBuildInput): PlanFactView {
    const exposure = buildExposure(input);
    const managers = input.managerIds.map(managerId =>
        buildManagerInput(managerId, input, exposure),
    );

    return {
        monthKey: input.monthKey,
        exposure,
        managers: managers.map(manager => ({
            managerId: manager.managerId,
            rows: reconcile(manager),
        })),
        team: reconcileTeam(managers, exposure),
        hasPlanSnapshot: input.plan !== null,
        hasMonthSnapshots: managers.some(manager => manager.hasFact),
    };
}
