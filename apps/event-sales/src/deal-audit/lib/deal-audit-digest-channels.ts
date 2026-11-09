/** Каналы доставки сводки «Забытые сделки» (значение настройки `deal_audit_digest_channels`). */
export const DEAL_AUDIT_DIGEST_CHANNEL = {
    /** Уведомление портала (колокольчик) — так сводка уходила изначально. */
    notify: 'notify',
    /** Личное сообщение в чат от имени интеграции — как слал легаси deals-order. */
    message: 'message',
    /** Задача получателю со сводкой в описании; прошлая задача-сводка закрывается. */
    task: 'task',
} as const;

export type DealAuditDigestChannel =
    (typeof DEAL_AUDIT_DIGEST_CHANNEL)[keyof typeof DEAL_AUDIT_DIGEST_CHANNEL];

export interface DealAuditDigestChannels {
    readonly notify: boolean;
    readonly message: boolean;
    readonly task: boolean;
}

/** Поведение до появления настройки: только уведомление портала. */
export const DEFAULT_DIGEST_CHANNELS: DealAuditDigestChannels = {
    notify: true,
    message: false,
    task: false,
};

const KNOWN = new Set<string>(Object.values(DEAL_AUDIT_DIGEST_CHANNEL));

/**
 * «task, message» → { task, message }. Регистр и разделители (запятая,
 * пробел, точка с запятой) не важны; незнакомые слова пропускаются. Ни
 * одного знакомого — поведение по умолчанию: владелец, ошибившись в
 * настройке, не должен остаться без сводок вовсе.
 */
export const parseDigestChannels = (raw: unknown): DealAuditDigestChannels => {
    const tokens =
        typeof raw === 'string'
            ? raw
                  .toLowerCase()
                  .split(/[\s,;]+/)
                  .filter(token => KNOWN.has(token))
            : [];
    if (!tokens.length) return DEFAULT_DIGEST_CHANNELS;
    return {
        notify: tokens.includes(DEAL_AUDIT_DIGEST_CHANNEL.notify),
        message: tokens.includes(DEAL_AUDIT_DIGEST_CHANNEL.message),
        task: tokens.includes(DEAL_AUDIT_DIGEST_CHANNEL.task),
    };
};
