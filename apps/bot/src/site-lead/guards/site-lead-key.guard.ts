import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
    APP_ROLE_ENV,
    AppRole,
    resolveAppRole,
} from '@lib/core/bootstrap/app-role';

/** Ключ сайта: один и тот же в env приложения bot и сервера сайта (apps/bitrix). */
export const SITE_LEAD_API_KEY_ENV = 'SITE_LEAD_API_KEY';

/** Заголовок, в котором сервер сайта передаёт ключ. */
export const SITE_LEAD_KEY_HEADER = 'x-site-lead-key';

/** Сравнение без утечки по времени: дайджесты одной длины при любой длине ключей. */
const sameKey = (provided: string, expected: string): boolean =>
    timingSafeEqual(
        createHash('sha256').update(provided).digest(),
        createHash('sha256').update(expected).digest(),
    );

/**
 * Пускает к ручке заявок только сервер сайта: у него есть ключ, у
 * случайного скрипта — нет. Отбитый запрос не тратит общий потолок заявок
 * в минуту, поэтому прямые вызовы ручки не могут заблокировать настоящие.
 *
 * Зеркало (APP_ROLE=standby) заявки не принимает: у него те же токены бота,
 * и он писал бы в боевой чат вторым, неучтённым потоком.
 */
@Injectable()
export class SiteLeadKeyGuard implements CanActivate {
    private readonly logger = new Logger(SiteLeadKeyGuard.name);

    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        if (
            resolveAppRole(this.config.get<string>(APP_ROLE_ENV)) ===
            AppRole.STANDBY
        ) {
            throw new ServiceUnavailableException(
                'Заявки с сайта принимает только основной сервер',
            );
        }

        const expected = (
            this.config.get<string>(SITE_LEAD_API_KEY_ENV) ?? ''
        ).trim();
        if (!expected) {
            this.logger.warn(
                `${SITE_LEAD_API_KEY_ENV} не задан — заявки с сайта не принимаются`,
            );
            throw new ServiceUnavailableException(
                'Приём заявок с сайта не настроен',
            );
        }

        const header = context.switchToHttp().getRequest<{
            headers: Record<string, string | string[] | undefined>;
        }>().headers[SITE_LEAD_KEY_HEADER];
        const provided = Array.isArray(header) ? header[0] : header;
        if (!provided || !sameKey(provided, expected)) {
            throw new UnauthorizedException('Неверный ключ сайта');
        }
        return true;
    }
}
