import type { OfferLetter } from 'generated/prisma';
import { OfferLetterEntity } from '../offer-letter.entity';

/** bigint только у portalId (внешний ключ на portals.id) */
export const createOfferLetterEntityFromPrisma = (
    row: OfferLetter,
): OfferLetterEntity => ({
    id: row.id,
    portalId: Number(row.portalId),
    bxUserId: row.bxUserId,
    name: row.name,
    text: row.text,
    isDefault: row.isDefault,
    isActive: row.isActive,
    sort: row.sort,
    legacyFieldId: row.legacyFieldId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});
