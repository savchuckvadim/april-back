import { OfferLetterEntity, OfferLetterScope } from '../offer-letter.entity';

export const isSameLetterScope = (
    left: OfferLetterScope,
    right: OfferLetterScope,
): boolean =>
    left.portalId === right.portalId && left.bxUserId === right.bxUserId;

/** Письма одной области: письма портала или личные письма одного менеджера */
export const lettersOfScope = (
    letters: readonly OfferLetterEntity[],
    scope: OfferLetterScope,
): OfferLetterEntity[] =>
    letters.filter(letter => isSameLetterScope(letter, scope));

/**
 * Какое письмо области должно быть по умолчанию. Письмо по умолчанию всегда
 * активное, оно одно, и оно есть, пока в области есть хоть одно активное.
 *
 * Порядок выбора: назначенное явно (`preferredId`), затем уже стоящее по
 * умолчанию, затем первое активное по `sort`. Область без активных писем
 * остаётся без письма по умолчанию.
 */
export const pickScopeDefaultId = (
    letters: readonly OfferLetterEntity[],
    preferredId?: string,
): string | null => {
    const active = letters
        .filter(letter => letter.isActive)
        .sort((left, right) => left.sort - right.sort);
    if (preferredId && active.some(letter => letter.id === preferredId)) {
        return preferredId;
    }
    return active.find(letter => letter.isDefault)?.id ?? active[0]?.id ?? null;
};

/** Флаги «по умолчанию» в области уже такие, как нужно: стоит у `defaultId` и больше ни у кого */
export const hasScopeDefaultFlags = (
    letters: readonly OfferLetterEntity[],
    defaultId: string | null,
): boolean => {
    const flagged = letters
        .filter(letter => letter.isDefault)
        .map(letter => letter.id);
    return defaultId === null
        ? flagged.length === 0
        : flagged.length === 1 && flagged[0] === defaultId;
};
