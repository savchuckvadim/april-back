import {
    EnumPortalAppCode,
    parseUserIds,
    type PortalAppSettingsValues,
    toPeriodDigestKinds,
} from '@lib/portal-lib/store/app-settings';
import {
    firstWorkdayDue,
    ROP_PERIOD_KIND,
    RopDuePolicy,
    weeklyDue,
} from '@lib/rop-reports';
import {
    DIGEST_PERIOD_KIND,
    DigestPeriodKind,
    digestSettingsOf,
} from '@lib/sales-ai-analytics';
import {
    PERIOD_DIGEST_DELIVERY_READY,
    PERIOD_DIGEST_WEEK_WORKDAYS_ONLY,
} from '../constants/period-digest.const';
import type { PeriodDigestOptions } from '../types/period-digest.types';

/**
 * Настройки итогов периода портала → параметры прогона. Одни правила «что
 * мусор, что по умолчанию» для крона и ручного запуска: иначе ручной
 * подсчёт разошёлся бы с выпуском по расписанию. Чистые функции.
 */

/** Ключи event-sales, которые читает отчёт. */
export type PeriodDigestSettingsValues = Pick<
    PortalAppSettingsValues<EnumPortalAppCode.eventSales>,
    | 'periodDigestCountOnly'
    | 'periodDigestKinds'
    | 'periodDigestWeekday'
    | 'periodDigestHour'
    | 'periodDigestToHead'
    | 'periodDigestDepartmentUserIds'
    | 'periodDigestUserIds'
    | 'periodDigestExcludeUserIds'
    | 'periodDigestDeadlineDaysWeek'
    | 'periodDigestDeadlineDaysMonth'
    | 'periodDigestMinCalls'
    | 'periodDigestShiftScore'
    | 'periodDigestShiftShare'
>;

/** Значения по умолчанию — те же, что в реестре настроек. */
export const PERIOD_DIGEST_DEFAULTS = {
    weekday: 1,
    hour: 9,
    deadlineDays: { week: 3, month: 5 },
} as const;

/** Срок задачи длиннее месяца бессмыслен даже у месячных итогов. */
const MAX_DEADLINE_DAYS = 30;

/** Целое в границах; иначе значение по умолчанию. */
const intInRange = (
    raw: unknown,
    min: number,
    max: number,
    fallback: number,
): number => {
    const value = Number(raw);
    return typeof raw !== 'boolean' &&
        raw !== '' &&
        Number.isInteger(value) &&
        value >= min &&
        value <= max
        ? value
        : fallback;
};

/** Список Bitrix ID из настройки; не строка — пусто. */
const idsOf = (raw: unknown): number[] =>
    parseUserIds(typeof raw === 'string' ? raw : null);

/** Политика выпуска вида: неделя — день и час, месяц — первый рабочий день. */
function policyOf(
    kind: DigestPeriodKind,
    weekday: number,
    hour: number,
): RopDuePolicy {
    return kind === DIGEST_PERIOD_KIND.week
        ? weeklyDue({
              weekday,
              hour,
              workdaysOnly: PERIOD_DIGEST_WEEK_WORKDAYS_ONLY,
          })
        : firstWorkdayDue({ kind: ROP_PERIOD_KIND.month, hour });
}

/**
 * `overrides.countOnly` приходит из ручного запуска; пока доставки нет
 * (Э7), прогон всегда только подсчёт.
 */
export function periodDigestOptionsOf(
    values: Partial<Record<keyof PeriodDigestSettingsValues, unknown>>,
    overrides: { readonly countOnly?: boolean } = {},
): PeriodDigestOptions {
    const kinds = toPeriodDigestKinds(values.periodDigestKinds);
    const weekday = intInRange(
        values.periodDigestWeekday,
        1,
        7,
        PERIOD_DIGEST_DEFAULTS.weekday,
    );
    const hour = intInRange(
        values.periodDigestHour,
        0,
        23,
        PERIOD_DIGEST_DEFAULTS.hour,
    );
    const countOnlySetting =
        overrides.countOnly ?? values.periodDigestCountOnly !== false;
    return {
        countOnly: !PERIOD_DIGEST_DELIVERY_READY || countOnlySetting,
        policies: kinds.map(kind => policyOf(kind, weekday, hour)),
        kinds,
        recipients: {
            toHead: values.periodDigestToHead !== false,
            // Сводки сотруднику нет: роль зарезервирована в каркасе.
            toEmployee: false,
            departmentUserIds: idsOf(values.periodDigestDepartmentUserIds),
            structureUserIds: idsOf(values.periodDigestUserIds),
        },
        excludeUserIds: new Set(idsOf(values.periodDigestExcludeUserIds)),
        deadlineDays: {
            week: intInRange(
                values.periodDigestDeadlineDaysWeek,
                1,
                MAX_DEADLINE_DAYS,
                PERIOD_DIGEST_DEFAULTS.deadlineDays.week,
            ),
            month: intInRange(
                values.periodDigestDeadlineDaysMonth,
                1,
                MAX_DEADLINE_DAYS,
                PERIOD_DIGEST_DEFAULTS.deadlineDays.month,
            ),
        },
        analytics: digestSettingsOf(values),
    };
}
