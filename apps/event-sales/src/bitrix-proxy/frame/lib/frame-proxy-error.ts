/** Ошибка Битрикса в том виде, в каком её видит фрейм. */
export interface FrameProxyBitrixError {
    error: string;
    errorDescription: string;
}

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value : '';

/**
 * Ошибка вызова Битрикса → код и описание для фрейма.
 *
 * Библиотека бросает ошибку axios с телом Битрикса `{ error,
 * error_description }`; сеть и таймаут — без тела, тогда берём сообщение.
 */
export function toFrameProxyError(failure: unknown): FrameProxyBitrixError {
    const data: unknown = (failure as { response?: { data?: unknown } })
        ?.response?.data;
    if (data && typeof data === 'object') {
        const body = data as Record<string, unknown>;
        const error = textOf(body.error);
        const errorDescription = textOf(body.error_description);
        if (error || errorDescription) return { error, errorDescription };
    }
    const message =
        failure instanceof Error
            ? failure.message
            : typeof failure === 'string'
              ? failure
              : 'неизвестная ошибка';
    return { error: 'PROXY_CALL_FAILED', errorDescription: message };
}
