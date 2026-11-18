import type {
    EnumPortalAppCode,
    PortalAppSettingsValues,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import {
    DIGEST_DEFAULT_SHIFT,
    DIGEST_MIN_CALLS,
    DigestShift,
} from './period-digest.thresholds';

/**
 * НАСТРОЙКИ ПОРТАЛА → ПАРАМЕТРЫ КАРТОЧКИ: минимум разобранных звонков для
 * новых рекомендаций и пороги заметного изменения (`period_digest_*`,
 * event-sales). Доля в настройке — процентные пункты (10), в карточке —
 * доля (0,1). Мусор и значения вне разумных границ — по умолчанию:
 * опечатка в админке не должна превращать каждое колебание в «стало хуже».
 */

/** Ключи настроек event-sales, которые читает карточка. */
export type DigestSettingsValues = Pick<
    PortalAppSettingsValues<EnumPortalAppCode.eventSales>,
    'periodDigestMinCalls' | 'periodDigestShiftScore' | 'periodDigestShiftShare'
>;

export interface DigestAnalyticsSettings {
    readonly minCalls: number;
    readonly shift: DigestShift;
}

/** Разумные границы настроек: за ними — значение по умолчанию. */
export const DIGEST_SETTINGS_RANGE = {
    minCalls: { min: 1, max: 100 },
    shiftScore: { min: 0.1, max: 5 },
    /** Процентные пункты. */
    shiftSharePoints: { min: 1, max: 50 },
} as const;

const PERCENT = 100;

const inRange = (
    raw: unknown,
    range: { readonly min: number; readonly max: number },
    fallback: number,
    integer = false,
): number => {
    const value = typeof raw === 'number' ? raw : Number(raw);
    const ok =
        typeof raw !== 'boolean' &&
        raw !== '' &&
        raw !== null &&
        Number.isFinite(value) &&
        value >= range.min &&
        value <= range.max &&
        (!integer || Number.isInteger(value));
    return ok ? value : fallback;
};

/**
 * Минимум звонков и пороги сдвига из настроек портала. Порог «на звонок»
 * (спирали методики) отдельной настройки не имеет — по умолчанию.
 */
export function digestSettingsOf(
    values: Partial<Record<keyof DigestSettingsValues, unknown>>,
): DigestAnalyticsSettings {
    return {
        minCalls: inRange(
            values.periodDigestMinCalls,
            DIGEST_SETTINGS_RANGE.minCalls,
            DIGEST_MIN_CALLS,
            true,
        ),
        shift: {
            score: inRange(
                values.periodDigestShiftScore,
                DIGEST_SETTINGS_RANGE.shiftScore,
                DIGEST_DEFAULT_SHIFT.score,
            ),
            share:
                inRange(
                    values.periodDigestShiftShare,
                    DIGEST_SETTINGS_RANGE.shiftSharePoints,
                    DIGEST_DEFAULT_SHIFT.share * PERCENT,
                ) / PERCENT,
            perCall: DIGEST_DEFAULT_SHIFT.perCall,
        },
    };
}
