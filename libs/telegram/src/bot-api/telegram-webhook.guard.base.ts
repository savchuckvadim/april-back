import {
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import {
    TELEGRAM_SECRET_HEADER,
    telegramSecretsEqual,
} from './telegram-webhook-secret';

interface HeadersRequest {
    headers: Record<string, string | string[] | undefined>;
}

/**
 * Вебхук бота принимает только запросы с секретом, который приложение само
 * передало Telegram при регистрации. Токена нет — вебхук закрыт.
 * Наследник говорит, чей это бот и какой секрет сейчас верный.
 */
export abstract class TelegramWebhookGuardBase implements CanActivate {
    /** В родительном падеже — для текста ошибки: «Telegram-бота поддержки». */
    protected abstract readonly botNameGenitive: string;

    /** Секрет текущего токена; null — бот не настроен. */
    protected abstract expectedSecret(): Promise<string | null>;

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const expected = await this.expectedSecret();
        if (!expected) {
            throw new UnauthorizedException(
                `Вебхук ${this.botNameGenitive} не настроен`,
            );
        }
        const header = context.switchToHttp().getRequest<HeadersRequest>()
            .headers[TELEGRAM_SECRET_HEADER];
        const given = Array.isArray(header)
            ? (header[0] ?? '')
            : (header ?? '');
        if (!telegramSecretsEqual(given, expected)) {
            throw new UnauthorizedException('Неверный секрет вебхука Telegram');
        }
        return true;
    }
}
