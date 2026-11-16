import type { PortalAppSettingOption } from '../portal-app-settings.schema';

/**
 * Каналы доставки сводки «Забытые сделки» — коды настройки
 * `deal_audit_digest_channels` (event-sales). Общие для реестра настроек
 * (галочки в админке) и разбора значения в apps/event-sales.
 */
export const DEAL_AUDIT_DIGEST_CHANNEL = {
    /** Уведомление портала (колокольчик) — так сводка уходила изначально. */
    notify: 'notify',
    /** Личное сообщение в чат — как слал легаси deals-order. */
    message: 'message',
    /** Задача получателю со сводкой в описании; прошлая задача-сводка закрывается. */
    task: 'task',
} as const;

export type DealAuditDigestChannel =
    (typeof DEAL_AUDIT_DIGEST_CHANNEL)[keyof typeof DEAL_AUDIT_DIGEST_CHANNEL];

/** Галочки настройки в админке — в порядке «как советуем». */
export const DEAL_AUDIT_DIGEST_CHANNEL_OPTIONS: readonly PortalAppSettingOption[] =
    [
        {
            code: DEAL_AUDIT_DIGEST_CHANNEL.message,
            name: 'Личное сообщение в чат',
        },
        {
            code: DEAL_AUDIT_DIGEST_CHANNEL.task,
            name: 'Задача со сводкой (срок — сутки)',
        },
        {
            code: DEAL_AUDIT_DIGEST_CHANNEL.notify,
            name: 'Уведомление (колокольчик)',
        },
    ];

/** Канал по умолчанию: ничего не отмечено — личное сообщение. */
export const DEAL_AUDIT_DIGEST_DEFAULT_CHANNEL: DealAuditDigestChannel =
    DEAL_AUDIT_DIGEST_CHANNEL.message;
