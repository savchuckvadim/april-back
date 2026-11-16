import {
    DEAL_AUDIT_DIGEST_CHANNEL,
    DEAL_AUDIT_DIGEST_DEFAULT_CHANNEL,
} from '@lib/portal-lib/store/app-settings';

export {
    DEAL_AUDIT_DIGEST_CHANNEL,
    type DealAuditDigestChannel,
} from '@lib/portal-lib/store/app-settings';

export interface DealAuditDigestChannels {
    readonly notify: boolean;
    readonly message: boolean;
    readonly task: boolean;
}

/**
 * Ничего не выбрано — личное сообщение (владелец, 16.11.2026: уведомление
 * в колокольчике теряется; до этого по умолчанию было notify).
 */
export const DEFAULT_DIGEST_CHANNELS: DealAuditDigestChannels = {
    notify:
        DEAL_AUDIT_DIGEST_DEFAULT_CHANNEL === DEAL_AUDIT_DIGEST_CHANNEL.notify,
    message:
        DEAL_AUDIT_DIGEST_DEFAULT_CHANNEL === DEAL_AUDIT_DIGEST_CHANNEL.message,
    task: DEAL_AUDIT_DIGEST_DEFAULT_CHANNEL === DEAL_AUDIT_DIGEST_CHANNEL.task,
};

const KNOWN = new Set<string>(Object.values(DEAL_AUDIT_DIGEST_CHANNEL));

/**
 * «task,message» → { task, message }. Админка пишет коды галочек через
 * запятую; регистр и разделители (запятая, пробел, точка с запятой) не
 * важны, незнакомые слова пропускаются. Ни одного знакомого — поведение по
 * умолчанию: владелец, сняв все галочки, не должен остаться без сводок.
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
