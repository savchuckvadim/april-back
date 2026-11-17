/**
 * Движение сделок: итог сводки руководителям за прогон (вторая волна,
 * часть Б, 17.11.2026) — общий для состояния прогона (Redis), дневного
 * снимка (ais), Telegram и админки. Чистые типы без DI.
 */

/** Почему сводка в этом прогоне не рассылалась. */
export const DEAL_MOVEMENT_DIGEST_SKIP = {
    /** Сводка выключена настройкой портала. */
    disabled: 'disabled',
    /** Ручной счёт из админки: сводка — только после ночного счёта. */
    manual: 'manual',
    /** Сегодня (день портала) сводка уже уходила. */
    alreadySent: 'already_sent',
    /** Получатели в настройках не заданы. */
    noRecipients: 'no_recipients',
} as const;

export type DealMovementDigestSkip =
    (typeof DEAL_MOVEMENT_DIGEST_SKIP)[keyof typeof DEAL_MOVEMENT_DIGEST_SKIP];

/** Причина пропуска словами — для Telegram и админки. */
export const DEAL_MOVEMENT_DIGEST_SKIP_TITLES: Readonly<
    Record<DealMovementDigestSkip, string>
> = {
    disabled: 'выключена',
    manual: 'уходит только после ночного счёта',
    already_sent: 'сегодня уже отправлена',
    no_recipients: 'получатели не заданы',
};

export interface DealMovementDigestSummary {
    /** Сводка включена настройкой портала. */
    enabled: boolean;
    /** Почему не рассылалась; null — рассылалась. */
    skipped: DealMovementDigestSkip | null;
    /** Получателей, кому сводка положена (работают, есть что показать). */
    recipients: number;
    /** Сколько сводок дошло хотя бы одним каналом. */
    sent: number;
    /** Сколько не дошло ни одним каналом. */
    failed: number;
}

export const skippedDealMovementDigest = (
    enabled: boolean,
    skipped: DealMovementDigestSkip,
): DealMovementDigestSummary => ({
    enabled,
    skipped,
    recipients: 0,
    sent: 0,
    failed: 0,
});
