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

/**
 * Повторы job. Повтор помогает ровно в одном случае — когда пул конвертации
 * был перегружен и задача даже не начиналась; процессор снимает с ретраев
 * всё остальное (см. OfferWordEphemeralPdfProcessor).
 */
export const OFFER_WORD_EPHEMERAL_PDF_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
} as const;

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
