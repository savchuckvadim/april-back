import { createHash, timingSafeEqual } from 'node:crypto';

/** Заголовок, которым Telegram подписывает запросы вебхука (secret_token). */
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

/**
 * Секрет вебхука бота — вычисляется из токена, задавать его не нужно.
 * Telegram присылает секрет в заголовке каждого запроса; подделать его
 * может только тот, у кого есть токен, а у него и так весь бот.
 *
 * `purpose` — свой у каждого бота (`support`, `cabinet`): разные боты не
 * получат одинаковый секрет даже при ошибке с токеном. 64 hex-символа —
 * в пределах правила Telegram (1–256 символов, A-Z a-z 0-9 _ -). Сменили
 * токен — сменился и секрет; регистратор вебхука перерегистрирует его сам.
 */
export function telegramWebhookSecret(token: string, purpose: string): string {
    return createHash('sha256')
        .update(`april-telegram-webhook:${purpose}:${token}`)
        .digest('hex');
}

/** Сравнение секретов за постоянное время. */
export function telegramSecretsEqual(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}
