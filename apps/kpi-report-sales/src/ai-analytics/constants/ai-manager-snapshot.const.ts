/**
 * Константы менеджерских снапшотов Фазы 2 (план, поток 14b): коды и ритмы
 * шагов `calls` / `kpi` / `finance` / `style`, причины пропуска, заморозка
 * месяца, окно профиля стиля, лимит догона истории и границы периодов.
 *
 * Свой файл констант среза — правило владения общими файлами §1.6 п. 3:
 * `constants/ai-analytics.const.ts` правит только поток настроек, а
 * `constants/ai-snapshot.const.ts` — поток конвейера. Магических строк
 * шагов и причин в коде среза нет (ai/rules/pbx-typing.md).
 */
import { isoWeekday, shiftDate } from '@lib/sales-ai-analytics';
import { AI_PIPELINE_BACKFILL, AiPipelineRhythm } from './ai-snapshot.const';
import {
    firstDayOfNextMonth,
    prevDay,
    type IsoDate,
    type IsoMonth,
} from '../../shared/lib/month-segments.util';

/** Коды шагов среза (уникальны в массиве шагов конвейера). */
export const AI_MANAGER_STEP_CODE = {
    calls: 'calls',
    kpi: 'kpi',
    finance: 'finance',
    style: 'style',
} as const;
export type AiManagerStepCode =
    (typeof AI_MANAGER_STEP_CODE)[keyof typeof AI_MANAGER_STEP_CODE];

/**
 * Звонки нужны каждому ритму: недельный пишет снапшот недели, месячный и
 * ночной берут из тех же строк экспозицию и факты типов.
 */
export const AI_CALLS_STEP_RHYTHMS = [
    'nightly',
    'weekly',
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/** KPI и финансы недельному ритму не нужны — месяц собирается ночью. */
export const AI_KPI_STEP_RHYTHMS = [
    'nightly',
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

export const AI_FINANCE_STEP_RHYTHMS = [
    'nightly',
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/** Профиль стиля считается раз в месяц по окну в три месяца. */
export const AI_STYLE_STEP_RHYTHMS = [
    'monthly',
] as const satisfies readonly AiPipelineRhythm[];

/**
 * Причины пропуска шагов (штатная деградация §5.4): каждая объясняет
 * руководителю, почему записи за период нет, — молчания без причины быть
 * не должно.
 */
export const AI_MANAGER_SNAPSHOT_REASONS = {
    /** За неделю нет ни одного разбора — запись не создаётся. */
    weekNoAnalysis: 'week-no-analysis',
    /** Месяц заморожен (3-е число следующего) — ночной шаг не переписывает. */
    monthFrozen: 'month-frozen',
    /** Ростер ОП пуст: считать нечего. */
    rosterEmpty: 'roster-empty',
    /** KPI-фактов месяца в шине нет — шаг KPI пропущен или упал. */
    kpiMissing: 'kpi-facts-missing',
    /** В окне стиля нет разборов — профиль не считается. */
    styleWindowEmpty: 'style-window-empty',
} as const;
export type AiManagerSnapshotReason =
    (typeof AI_MANAGER_SNAPSHOT_REASONS)[keyof typeof AI_MANAGER_SNAPSHOT_REASONS];

/**
 * День следующего месяца, с которого месяц заморожен (план §3.1): 3-го
 * числа месячный ритм пишет окончательный снапшот, и ночные прогоны его
 * больше не перезаписывают.
 */
export const AI_MONTH_FREEZE_DAY = 3;

/** Окно профиля стиля — три месяца (документ стиля, 3.3). */
export const AI_STYLE_WINDOW_MONTHS = 3;

/**
 * Догон истории: месяцев `manager-month` за одну ночь. Больше нельзя —
 * ночная очередь портала одна на все выборки, а нормам следующей волны
 * важнее регулярность, чем скорость.
 */
export const AI_MONTH_BACKFILL_LIMIT = AI_PIPELINE_BACKFILL.maxMonthsPerNight;

/** Границы периода включительно ('YYYY-MM-DD'). */
export interface AiPeriodBounds {
    from: string;
    to: string;
}

/** Первый и последний день календарного месяца 'YYYY-MM'. */
export function monthBounds(monthKey: string): AiPeriodBounds {
    const month = monthKey as IsoMonth;
    return {
        from: `${monthKey}-01`,
        to: prevDay(firstDayOfNextMonth(month)),
    };
}

/** Понедельник ISO-недели по её ключу 'YYYY-Www' (ISO 8601: неделя с 4 января). */
export function weekMondayOfKey(weekKey: string): string {
    const [year, week] = weekKey.split('-W');
    const jan4 = `${year}-01-04` as IsoDate;
    const firstMonday = shiftDate(jan4, -(isoWeekday(jan4) - 1));
    return shiftDate(firstMonday, (Number(week) - 1) * 7);
}

/** Понедельник и воскресенье ISO-недели по её ключу. */
export function weekBounds(weekKey: string): AiPeriodBounds {
    const from = weekMondayOfKey(weekKey);
    return { from, to: shiftDate(from, 6) };
}

/** День, с которого месяц заморожен: 3-е число следующего месяца. */
export function monthFreezeDay(monthKey: string): string {
    const nextMonth = firstDayOfNextMonth(monthKey as IsoMonth);
    return `${nextMonth.slice(0, 7)}-${String(AI_MONTH_FREEZE_DAY).padStart(2, '0')}`;
}

/**
 * Месяц заморожен на дату прогона: прогон 3-го числа следующего месяца
 * (и позже) пишет окончательную запись с `frozen: true`.
 */
export function isMonthFrozen(monthKey: string, day: string): boolean {
    return day >= monthFreezeDay(monthKey);
}

/**
 * Месяцы окна, заканчивающегося на monthKey, по возрастанию: окно стиля
 * и догон истории берут ровно столько месяцев, сколько разрешено.
 */
export function monthKeysBack(monthKey: string, count: number): string[] {
    const months: string[] = [];
    let cursor = `${monthKey}-01`;
    for (let index = 0; index < Math.max(0, count); index += 1) {
        months.push(cursor.slice(0, 7));
        cursor = `${shiftDate(cursor, -1).slice(0, 7)}-01`;
    }
    return months.reverse();
}

/** Границы окна из нескольких месяцев, заканчивающегося на monthKey. */
export function monthsWindow(monthKey: string, count: number): AiPeriodBounds {
    const months = monthKeysBack(monthKey, count);
    return {
        from: monthBounds(months[0] ?? monthKey).from,
        to: monthBounds(monthKey).to,
    };
}
