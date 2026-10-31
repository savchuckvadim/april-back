/** Состояние выводится из дат: отдельной колонки нет, рассинхронизироваться нечему. */
export enum EPublicLinkStatus {
    ACTIVE = 'active',
    EXPIRED = 'expired',
    REVOKED = 'revoked',
}

export interface PublicLinkDates {
    revokedAt: Date | null;
    expiresAt: Date | null;
}

export const publicLinkStatus = (
    link: PublicLinkDates,
    now: Date = new Date(),
): EPublicLinkStatus => {
    if (link.revokedAt) return EPublicLinkStatus.REVOKED;
    if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) {
        return EPublicLinkStatus.EXPIRED;
    }
    return EPublicLinkStatus.ACTIVE;
};
