/** Redis: JSON { pdfBase64, fileName, mimeType } */
export const OFFER_WORD_EPHEMERAL_PDF_REDIS_PREFIX =
    'offer-word-ephemeral-pdf:';

/** Флаг отмены: offer-word-ephemeral-pdf:cancel:{operationId} */
export const OFFER_WORD_EPHEMERAL_PDF_CANCEL_PREFIX =
    'offer-word-ephemeral-pdf:cancel:';

/** TTL результата в Redis (секунды) */
export const OFFER_WORD_EPHEMERAL_PDF_REDIS_TTL_SEC = 900;

/** TTL флага отмены (секунды) */
export const OFFER_WORD_EPHEMERAL_PDF_CANCEL_TTL_SEC = 600;

export function offerWordEphemeralPdfResultRedisKey(
    operationId: string,
): string {
    return `${OFFER_WORD_EPHEMERAL_PDF_REDIS_PREFIX}${operationId}`;
}

export function offerWordEphemeralPdfCancelRedisKey(
    operationId: string,
): string {
    return `${OFFER_WORD_EPHEMERAL_PDF_CANCEL_PREFIX}${operationId}`;
}
