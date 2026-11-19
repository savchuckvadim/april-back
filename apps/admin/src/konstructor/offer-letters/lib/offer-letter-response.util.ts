import { OfferLetterEntity } from '@lib/portal-lib/konstructor';
import { OfferLetterResponseDto } from '../dto/offer-letter-response.dto';

export const toOfferLetterResponse = (
    letter: OfferLetterEntity,
): OfferLetterResponseDto => ({
    id: letter.id,
    portalId: letter.portalId,
    bxUserId: letter.bxUserId,
    name: letter.name,
    text: letter.text,
    isDefault: letter.isDefault,
    isActive: letter.isActive,
    sort: letter.sort,
    createdAt: letter.createdAt?.toISOString() ?? null,
    updatedAt: letter.updatedAt?.toISOString() ?? null,
});
