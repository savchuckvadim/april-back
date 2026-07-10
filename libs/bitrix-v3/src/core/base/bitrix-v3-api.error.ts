import {
    IBitrixV3ErrorBody,
    IBitrixV3ValidationIssue,
} from '../interface/bitrix-v3-response.interface';

/**
 * Типизированная ошибка REST 3.0.
 * Битрикс возвращает единый формат `{error: {code, message, validation}}` —
 * ошибка сохраняет его целиком плюс контекст вызова.
 */
export class BitrixV3ApiError extends Error {
    constructor(
        /** Метод, на котором произошла ошибка */
        public readonly method: string,
        /** Код ошибки Битрикс, например BITRIX_REST_V3_EXCEPTION_VALIDATION_* */
        public readonly code: string,
        message: string,
        /** Детали валидации (если ошибка в параметрах запроса) */
        public readonly validation?: IBitrixV3ValidationIssue[],
        /** HTTP-статус ответа (если известен) */
        public readonly httpStatus?: number,
    ) {
        super(`Bitrix V3 [${method}] ${code}: ${message}`);
        this.name = 'BitrixV3ApiError';
    }

    static fromBody(
        method: string,
        body: IBitrixV3ErrorBody,
        httpStatus?: number,
    ): BitrixV3ApiError {
        return new BitrixV3ApiError(
            method,
            body.error.code,
            body.error.message,
            body.error.validation,
            httpStatus,
        );
    }
}

/** Type guard: тело ответа содержит ошибку REST 3.0 */
export function isBitrixV3ErrorBody(body: unknown): body is IBitrixV3ErrorBody {
    if (typeof body !== 'object' || body === null) {
        return false;
    }
    const error = (body as { error?: unknown }).error;
    return (
        typeof error === 'object' &&
        error !== null &&
        typeof (error as { code?: unknown }).code === 'string'
    );
}
