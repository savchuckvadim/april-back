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
} as const;

export type DealMovementDigestMode =
    (typeof DEAL_MOVEMENT_DIGEST_MODE)[keyof typeof DEAL_MOVEMENT_DIGEST_MODE];

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
    ];

/** По умолчанию — только новые (решение 17.11.2026). */
export const DEAL_MOVEMENT_DEFAULT_DIGEST_MODE: DealMovementDigestMode =
    DEAL_MOVEMENT_DIGEST_MODE.newOnly;

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
