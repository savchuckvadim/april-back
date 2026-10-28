import { timingSafeEqual } from 'crypto';
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Заголовок, которым Telegram подписывает запросы вебхука (secret_token). */
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
export const SUPPORT_TELEGRAM_WEBHOOK_SECRET_ENV =
    'SUPPORT_TELEGRAM_WEBHOOK_SECRET';

interface HeadersRequest {
    headers: Record<string, string | string[] | undefined>;
}

/** Сравнение секретов за постоянное время. */
export function secretsEqual(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Вебхук принимает только запросы с секретом, который bot сам передал
 * Telegram при регистрации. Секрет не задан — вебхук закрыт.
 */
@Injectable()
export class SupportTelegramWebhookGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const expected = (
            this.config.get<string>(SUPPORT_TELEGRAM_WEBHOOK_SECRET_ENV) ?? ''
        ).trim();
        if (!expected) {
            throw new UnauthorizedException(
                'Вебхук Telegram-бота поддержки не настроен',
            );
        }
        const header = context.switchToHttp().getRequest<HeadersRequest>()
            .headers[TELEGRAM_SECRET_HEADER];
        const given = Array.isArray(header)
            ? (header[0] ?? '')
            : (header ?? '');
        if (!secretsEqual(given, expected)) {
            throw new UnauthorizedException('Неверный секрет вебхука Telegram');
        }
        return true;
    }
}
