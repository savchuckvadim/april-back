import type { PortalAppSettingOption } from '../portal-app-settings.schema';

/**
 * Когда слать сводку «Движение сделок» руководителям — коды настройки
 * `deal_movement_digest_mode` (event-sales). Общие для реестра настроек
 * (выбор в админке) и сводки в apps/event-sales.
 */
export const DEAL_MOVEMENT_DIGEST_MODE = {
    /** Только когда в наборе получателя есть новые проблемные сделки. */
    newOnly: 'new_only',
    /** Каждое утро, если в наборе есть хоть одна сделка не «движется». */
    daily: 'daily',
    /** Раз в неделю в выбранный день — итоги с прошлой сводки (20.11.2026). */
    weekly: 'weekly',
    /** Раз в две недели в выбранный день — итоги с прошлой сводки. */
    biweekly: 'biweekly',
} as const;

export type DealMovementDigestMode =
    (typeof DEAL_MOVEMENT_DIGEST_MODE)[keyof typeof DEAL_MOVEMENT_DIGEST_MODE];

/**
 * Режимы «итогов за период»: сводка уходит в выбранный день недели и не
 * чаще, чем раз в столько дней (отметка последней отправки — в Redis).
 */
export const DEAL_MOVEMENT_DIGEST_PERIOD_DAYS: Readonly<
    Partial<Record<DealMovementDigestMode, number>>
> = {
    [DEAL_MOVEMENT_DIGEST_MODE.weekly]: 7,
    [DEAL_MOVEMENT_DIGEST_MODE.biweekly]: 14,
};

/** Длина периода режима в днях; у ежедневных режимов — null. */
export const dealMovementDigestPeriodDays = (
    mode: DealMovementDigestMode,
): number | null => DEAL_MOVEMENT_DIGEST_PERIOD_DAYS[mode] ?? null;

/** Выбор в админке. */
export const DEAL_MOVEMENT_DIGEST_MODE_OPTIONS: readonly PortalAppSettingOption[] =
    [
        {
            code: DEAL_MOVEMENT_DIGEST_MODE.newOnly,
            name: 'Только когда появились новые проблемные сделки',
        },
        {
            code: DEAL_MOVEMENT_DIGEST_MODE.daily,
            name: 'Каждое утро',
        },
        {
            code: DEAL_MOVEMENT_DIGEST_MODE.weekly,
            name: 'Раз в неделю — итоги за неделю',
        },
        {
            code: DEAL_MOVEMENT_DIGEST_MODE.biweekly,
            name: 'Раз в две недели — итоги за две недели',
        },
    ];

/** По умолчанию — только новые (решение 17.11.2026). */
export const DEAL_MOVEMENT_DEFAULT_DIGEST_MODE: DealMovementDigestMode =
    DEAL_MOVEMENT_DIGEST_MODE.newOnly;

/** День недели итогов за период по умолчанию: 1 — понедельник (ISO). */
export const DEAL_MOVEMENT_DEFAULT_DIGEST_WEEKDAY = 1;

const DIGEST_MODES: readonly string[] = Object.values(
    DEAL_MOVEMENT_DIGEST_MODE,
);

/** Значение настройки → режим; пусто и мусор — по умолчанию. */
export const toDealMovementDigestMode = (
    raw: unknown,
): DealMovementDigestMode =>
    typeof raw === 'string' && DIGEST_MODES.includes(raw)
        ? (raw as DealMovementDigestMode)
        : DEAL_MOVEMENT_DEFAULT_DIGEST_MODE;

/** Значение настройки → день недели 1–7; пусто и мусор — понедельник. */
export const toDealMovementDigestWeekday = (raw: unknown): number => {
    if (raw === null || raw === undefined || raw === '') {
        return DEAL_MOVEMENT_DEFAULT_DIGEST_WEEKDAY;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value >= 1 && value <= 7
        ? value
        : DEAL_MOVEMENT_DEFAULT_DIGEST_WEEKDAY;
};
