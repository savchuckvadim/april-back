/**
 * Состояние ссылки выводится из дат: отдельной колонки нет, значит
 * рассинхронизироваться нечему.
 */
export enum ERenewalOfferLinkStatus {
    ACTIVE = 'active',
    EXPIRED = 'expired',
    REVOKED = 'revoked',
}

export interface RenewalOfferLinkDates {
    revokedAt: Date | null;
    expiresAt: Date | null;
}

export const renewalOfferLinkStatus = (
    link: RenewalOfferLinkDates,
    now: Date = new Date(),
): ERenewalOfferLinkStatus => {
    if (link.revokedAt) return ERenewalOfferLinkStatus.REVOKED;
    if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) {
        return ERenewalOfferLinkStatus.EXPIRED;
    }
    return ERenewalOfferLinkStatus.ACTIVE;
};
