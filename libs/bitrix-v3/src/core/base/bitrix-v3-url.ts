import { IBitrixV3Credentials } from '../interface/bitrix-v3-credentials.interface';

/**
 * Строит URL вызова метода REST 3.0.
 *
 * Отличие от v1 — сегмент `/api/` после `/rest/`:
 * - вебхук: `https://{domain}/rest/api/{userId}/{token}/{method}`
 * - OAuth:  `https://{domain}/rest/api/{method}` (токен уходит в теле, поле `auth`)
 */
export function buildBitrixV3Url(
    credentials: IBitrixV3Credentials,
    method: string,
): string {
    const { domain, webhook, accessToken } = credentials;
    if (!domain) {
        throw new Error('BitrixV3: не указан domain портала');
    }

    if (webhook) {
        const hookPath = normalizeWebhookPath(webhook, domain);
        return `https://${domain}/rest/api/${hookPath}/${method}`;
    }

    if (accessToken) {
        return `https://${domain}/rest/api/${method}`;
    }

    throw new Error(
        `BitrixV3 [${domain}]: нужен webhook или accessToken для авторизации`,
    );
}

/**
 * Приводит вебхук любого принятого формата к виду `{userId}/{token}`:
 * `rest/447/abc`, `/rest/447/abc/`, `https://domain/rest/447/abc/` -> `447/abc`.
 */
function normalizeWebhookPath(webhook: string, domain: string): string {
    let path = webhook.trim();

    path = path.replace(/^https?:\/\/[^/]+\//i, '');
    path = path.replace(/^\/+/, '').replace(/\/+$/, '');
    path = path.replace(/^rest(\/|$)/i, '');

    if (!path) {
        throw new Error(`BitrixV3 [${domain}]: пустой webhook`);
    }
    return path;
}
