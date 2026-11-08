import {
    Logger,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';
import {
    APP_ROLE_ENV,
    AppRole,
    resolveAppRole,
} from '@lib/core/bootstrap/app-role';

/** Как часто сверяем токен из админки с зарегистрированным вебхуком. */
export const TELEGRAM_WEBHOOK_RESYNC_MS = 60_000;

/**
 * Вебхук бота в Telegram: при старте и далее раз в минуту. Если токен
 * сменился (или вебхук ещё не ставили) — регистрируем заново с секретом
 * нового токена. Поэтому замена токена в админке (например, после утечки)
 * не требует перезапуска. Пока токен прежний — ни одного запроса в Telegram.
 *
 * На зеркале (APP_ROLE=standby) не трогаем: иначе резерв перетянул бы
 * обновления на себя. Сеть Telegram старт не задерживает.
 */
export abstract class TelegramWebhookRegistrarBase
    implements OnApplicationBootstrap, OnApplicationShutdown
{
    protected abstract readonly logger: Logger;
    /** Начало строк лога: «Клиентский Telegram-бот». */
    protected abstract readonly botName: string;
    /** Имя переменной с адресом вебхука — для подсказки в логе. */
    protected abstract readonly urlEnvName: string;
    /** Что не работает без адреса: «привязка чатов не работает». */
    protected abstract readonly noUrlEffect: string;

    /** Публичный адрес вебхука этого сервера; '' — не задан. */
    protected abstract webhookUrl(): string;
    /** Секрет текущего токена; null — токена нет. */
    protected abstract webhookSecret(): Promise<string | null>;
    /** @throws ошибка Telegram */
    protected abstract setWebhook(url: string, secret: string): Promise<void>;

    private timer: NodeJS.Timeout | null = null;
    /** Секрет, с которым вебхук зарегистрирован сейчас (отпечаток токена). */
    private registeredSecret: string | null = null;
    private warnedNoUrl = false;
    private syncing = false;

    onApplicationBootstrap(): void {
        if (resolveAppRole(process.env[APP_ROLE_ENV]) === AppRole.STANDBY) {
            this.logger.log(
                `${this.botName}: режим ожидания — вебхук не регистрируем`,
            );
            return;
        }
        void this.sync();
        this.timer = setInterval(
            () => void this.sync(),
            TELEGRAM_WEBHOOK_RESYNC_MS,
        );
        this.timer.unref();
    }

    onApplicationShutdown(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Привести вебхук к текущему токену. Без смены токена ничего не делает. */
    async sync(): Promise<void> {
        if (this.syncing) return;
        this.syncing = true;
        try {
            const secret = await this.webhookSecret();
            if (!secret || secret === this.registeredSecret) return;
            const url = this.webhookUrl();
            if (!url) {
                if (!this.warnedNoUrl) {
                    this.logger.warn(
                        `${this.botName}: не задан ${this.urlEnvName} — ${this.noUrlEffect}`,
                    );
                    this.warnedNoUrl = true;
                }
                return;
            }
            await this.setWebhook(url, secret);
            this.registeredSecret = secret;
            this.logger.log(`${this.botName}: вебхук ${url}`);
        } catch (error) {
            this.logger.error(
                `${this.botName}: вебхук не установлен: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        } finally {
            this.syncing = false;
        }
    }
}
