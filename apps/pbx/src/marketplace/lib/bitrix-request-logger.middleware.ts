import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { maskedJson } from './mask-payload.util';

/**
 * Сквозное логирование ВСЕХ входящих запросов на /bitrix-marketplace/*.
 *
 * Нужно для живой отладки установки: видно, что фактически шлёт Битрикс
 * (метод, content-type, body, query) и что мы ответили (статус, redirect,
 * длительность). Токены в body/query МАСКИРУЮТСЯ (mask-payload.util).
 * Дублирует журнал bitrix_app_events на уровне логов приложения —
 * смотреть: docker logs app-pbx | grep BitrixInbound.
 */
@Injectable()
export class BitrixRequestLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('BitrixInbound');

    use(req: Request, res: Response, next: NextFunction): void {
        const startedAt = Date.now();
        this.logger.log(
            `→ ${req.method} ${req.originalUrl} ct=${req.headers['content-type'] ?? '-'} ip=${req.ip ?? '-'} body=${maskedJson(req.body)} query=${maskedJson(req.query)}`,
        );

        res.on('finish', () => {
            const location = res.getHeader('location');
            this.logger.log(
                `← ${req.method} ${req.originalUrl} status=${res.statusCode} ${Date.now() - startedAt}ms${location ? ` redirect=${String(location)}` : ''}`,
            );
        });

        next();
    }
}
