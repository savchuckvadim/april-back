import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Guard admin-эндпоинтов маркетплейса: заголовок X-Admin-Key должен
 * совпадать с env MARKETPLACE_ADMIN_KEY. Если переменная не задана —
 * admin-эндпоинты ВЫКЛЮЧЕНЫ (любой запрос отклоняется), чтобы на
 * публичном домене не оказалось незащищённой ручки.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
    private readonly logger = new Logger(AdminKeyGuard.name);

    constructor(private readonly configService: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const expected = this.configService.get<string>(
            'MARKETPLACE_ADMIN_KEY',
        );
        if (!expected) {
            this.logger.warn(
                'MARKETPLACE_ADMIN_KEY не задан — admin-эндпоинты выключены',
            );
            throw new ForbiddenException('Admin-эндпоинты выключены');
        }

        const request = context.switchToHttp().getRequest<Request>();
        const provided = request.headers['x-admin-key'];
        if (typeof provided !== 'string' || provided !== expected) {
            this.logger.warn(
                `Неверный X-Admin-Key: ${request.method} ${request.originalUrl} ip=${request.ip ?? '-'}`,
            );
            throw new ForbiddenException('Неверный ключ администратора');
        }
        return true;
    }
}
