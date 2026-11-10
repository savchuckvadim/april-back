import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TelegramService } from '@lib/telegram/telegram.service';
import dayjs from 'dayjs';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    constructor(private readonly telegram: TelegramService) {}

    async use(req: Request, res: Response, next: NextFunction) {
        const timeStart = dayjs();
        let message = `📥 Входящий запрос: ${req.method}\n🧭 URL: ${req.originalUrl}\n`;

        if (Object.keys(req.query).length > 0) {
            message += `🔎 Query: ${JSON.stringify(req.query, null, 2)}\n`;
        }

        if (req.body && Object.keys(req.body).length > 0) {
            message += `📦 Body: ${JSON.stringify(req.body, null, 2)}\n`;
        }

        await this.telegram.sendMessage(message);

        // Обработчик события — синхронный: express не ждёт промис, и
        // упавшая отправка в Telegram раньше валила процесс необработанным
        // отказом (баг №8 плана «без any»).
        res.on('finish', () => {
            const duration = dayjs().diff(timeStart, 'ms');
            void this.telegram
                .sendMessage(
                    `✅ Ответ: ${res.statusCode} за ${duration}мс\n🧭 ${req.method} ${req.originalUrl}`,
                )
                .catch(() => undefined);
        });

        next();
    }
}
