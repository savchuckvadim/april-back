/**
 * Число прогноза, когда журнала дня ещё нет: ночной расчёт прогноза на
 * портале не прошёл или модель портала не построена. Правило владельца
 * (16.11.2026): карточка всегда показывает число, пусть неточное, а не
 * «данных недостаточно» — оно уточнится само.
 *
 * Считается из месячных снимков менеджеров (`finance.salesCount`): расчёт
 * по темпу с начала месяца либо среднее за три прошлых месяца. Нет ни
 * продаж месяца, ни трёх прошлых месяцев — показывать нечего (null).
 *
 * Чистые функции: без DI, Bitrix и `new Date()`.
 */
import { monthKeysBack } from '../../constants/ai-manager-snapshot.const';
import { previousMonthKey } from '../../constants/ai-snapshot.const';
import type { ForecastShown } from './forecast-shown.util';

/** Сколько прошлых месяцев усредняем — как у журнала прогноза. */
const MEAN_MONTHS = 3;

/**
 * До какого дня месяца темп считается слишком шумным: одна продажа в
 * первые дни даёт прогноз в разы выше реального, поэтому при наличии
 * среднего за прошлые месяцы берётся оно.
 */
const PACE_UNSTABLE_UNTIL_DAY = 4;

/** Месячный снимок менеджера в объёме расчёта. */
export interface MonthSalesRecord {
    periodKey: string;
    managerId: string | null;
    payload: unknown;
}

/** Числа карточки прогноза без журнала дня. */
export interface ForecastFallback {
    /** День расчёта 'YYYY-MM-DD' в TZ портала. */
    asOf: string;
    /** Продажи отдела с начала месяца; null — снимка месяца ещё нет. */
    done: number | null;
    /** Расчёт по темпу с начала месяца; null — снимка месяца ещё нет. */
    naive: number | null;
    /** Среднее за три прошлых месяца; null — какого-то из них нет. */
    mean3: number | null;
    shown: ForecastShown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const salesOf = (payload: unknown): number | null => {
    if (!isRecord(payload) || !isRecord(payload.finance)) return null;
    const sales = payload.finance.salesCount;
    return typeof sales === 'number' && Number.isFinite(sales) ? sales : null;
};

/**
 * Продажи отдела по месяцам: сумма по менеджерам, по одной записи на
 * менеджер-месяц (последняя побеждает). Месяца без записей в карте нет —
 * «нет факта», а не ноль.
 */
export function departmentMonthSales(
    records: readonly MonthSalesRecord[],
): Map<string, number> {
    const perManager = new Map<string, { monthKey: string; sales: number }>();
    for (const record of records) {
        if (record.managerId === null) continue;
        const sales = salesOf(record.payload);
        if (sales === null) continue;
        perManager.set(`${record.periodKey}\u0000${record.managerId}`, {
            monthKey: record.periodKey,
            sales,
        });
    }
    const sums = new Map<string, number>();
    for (const { monthKey, sales } of perManager.values()) {
        sums.set(monthKey, (sums.get(monthKey) ?? 0) + sales);
    }
    return sums;
}

/** Месяцы, которые нужны расчёту: текущий и три прошлых. */
export function fallbackMonthKeys(day: string): string[] {
    return [
        day.slice(0, 7),
        ...monthKeysBack(previousMonthKey(day), MEAN_MONTHS),
    ];
}

const daysInMonth = (monthKey: string): number => {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

/**
 * @param day день расчёта 'YYYY-MM-DD' в TZ портала
 * @param monthSales продажи отдела по месяцам ('YYYY-MM' → число)
 */
export function fallbackForecast(
    day: string,
    monthSales: ReadonlyMap<string, number>,
): ForecastFallback | null {
    const monthKey = day.slice(0, 7);
    const dayOfMonth = Number(day.slice(8, 10));
    const done = monthSales.get(monthKey) ?? null;
    const naive =
        done === null || !(dayOfMonth >= 1)
            ? null
            : (done * daysInMonth(monthKey)) / dayOfMonth;
    const previous = monthKeysBack(previousMonthKey(day), MEAN_MONTHS).map(
        key => monthSales.get(key),
    );
    const mean3 = previous.every(
        (sales): sales is number => sales !== undefined,
    )
        ? previous.reduce((sum, sales) => sum + sales, 0) / MEAN_MONTHS
        : null;

    const paceUsable =
        naive !== null &&
        (done ?? 0) > 0 &&
        (dayOfMonth > PACE_UNSTABLE_UNTIL_DAY || mean3 === null);
    const shown: ForecastShown | null = paceUsable
        ? { source: 'naive', value: naive, note: 'no-model' }
        : mean3 !== null
          ? { source: 'mean3', value: mean3, note: 'no-model' }
          : naive !== null
            ? { source: 'naive', value: naive, note: 'no-model' }
            : null;
    return shown === null ? null : { asOf: day, done, naive, mean3, shown };
}
