/**
 * Маскирование секретов перед записью в журнал bitrix_app_events.
 * Сырые токены в журнале хранить нельзя.
 */

const SECRET_KEYS = new Set([
    'auth_id',
    'refresh_id',
    'access_token',
    'refresh_token',
    'application_token',
    'app_sid',
    'client_secret',
]);

function maskValue(value: string): string {
    if (value.length <= 8) {
        return '***';
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function maskPayload(source: unknown): unknown {
    if (typeof source === 'string') {
        return source;
    }
    if (Array.isArray(source)) {
        return source.map(item => maskPayload(item));
    }
    if (source && typeof source === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
            source as Record<string, unknown>,
        )) {
            if (
                SECRET_KEYS.has(key.toLowerCase()) &&
                typeof value === 'string'
            ) {
                result[key] = maskValue(value);
            } else {
                result[key] = maskPayload(value);
            }
        }
        return result;
    }
    return source;
}

export function maskedJson(source: unknown): string {
    try {
        return JSON.stringify(maskPayload(source));
    } catch {
        return '{"error":"payload not serializable"}';
    }
}
