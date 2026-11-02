/**
 * Строка БД → предложение и DTO.
 *
 * Источник истины для состава — колонки, а не `offer_json`: по колонкам
 * считают отчёты, и расходиться эти две записи не должны. Из JSON берём
 * только то, чего в колонках нет, — «другие услуги» строками.
 */
import type { RenewalOfferLinkRecord } from '../repositories/renewal-offer-link.prisma.repository';
import type { RenewalOfferLinkDto } from '../dto/renewal-offer-link.dto';
import { renewalOfferLinkStatus } from './renewal-offer-status.util';
import {
    RENEWAL_LIMITS,
    type RenewalExtraLine,
    type RenewalOffer,
} from './renewal-offer.model';

/** Достаёт «другие услуги» из слепка, не доверяя его форме. */
export function extrasFromJson(value: unknown): RenewalExtraLine[] {
    if (!value || typeof value !== 'object') return [];
    const extras = (value as { extras?: unknown }).extras;
    if (!Array.isArray(extras)) return [];

    const lines: RenewalExtraLine[] = [];
    for (const raw of extras.slice(0, RENEWAL_LIMITS.extras.max)) {
        if (!raw || typeof raw !== 'object') continue;
        const line = raw as Record<string, unknown>;
        const title = typeof line.title === 'string' ? line.title.trim() : '';
        if (!title) continue;
        const price = typeof line.price === 'number' ? line.price : 0;
        lines.push({
            title,
            price: Math.max(0, Math.round(price)),
            period: line.period === 'once' ? 'once' : 'month',
        });
    }
    return lines;
}

/** Строка БД → предложение. */
export function offerFromRecord(record: RenewalOfferLinkRecord): RenewalOffer {
    return {
        clientName: record.clientName,

        salesIncluded: record.salesIncluded,
        salesPrice: record.salesPrice,

        aiIncluded: record.aiIncluded,
        aiEmployees: record.aiEmployees,
        aiBasePrice: record.aiBasePrice,
        aiBaseEmployees: record.aiBaseEmployees,
        aiExtraPrice: record.aiExtraPrice,
        aiFreeDelta: record.aiFreeDelta,

        managerIncluded: record.managerIncluded,
        managerPrice: record.managerPrice,

        devIncluded: record.devIncluded,
        devHours: record.devHours,
        devHourPrice: record.devHourPrice,

        adjustment: record.adjustment,
        adjustmentLabel: record.adjustmentLabel,

        extras: extrasFromJson(record.offerJson),
    };
}

/** Строка БД → ссылка для списка в админке. */
export function linkToDto(record: RenewalOfferLinkRecord): RenewalOfferLinkDto {
    const offer = offerFromRecord(record);
    return {
        id: record.id,
        token: record.token,
        clientName: record.clientName,
        title: record.title,
        monthlyTotal: record.monthlyTotal,
        offer: {
            ...offer,
            extras: offer.extras.map(line => ({ ...line })),
        },
        status: renewalOfferLinkStatus(record),
        expiresAt: record.expiresAt?.toISOString() ?? null,
        revokedAt: record.revokedAt?.toISOString() ?? null,
        viewCount: record.viewCount,
        lastViewedAt: record.lastViewedAt?.toISOString() ?? null,
        createdAt: record.createdAt?.toISOString() ?? null,
    };
}
