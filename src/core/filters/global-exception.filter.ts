import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TelegramService } from '../../modules/telegram/telegram.service';
import * as path from 'path';
import { ApiResponse, EResultCode } from '../interfaces/response.interface';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    constructor(private readonly telegram: TelegramService) { }

    async catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        if (exception instanceof BadRequestException) {
            const errorResponse = exception.getResponse();
            const details = typeof errorResponse === 'object'
                ? JSON.stringify(errorResponse, null, 2)
                : errorResponse;

            const message = `❌ Validation error:\n${details}`;
            this.logger.error(message);
            await this.telegram.sendMessage(message);

            return response.status(400).json(errorResponse);
        }

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const error =
            exception instanceof Error
                ? exception
                : new Error(JSON.stringify(exception));

        // Разбор stack trace
        let file = '';
        let line = '';
        let func = '';
        let code = '';
        try {
            const stackLines = error.stack?.split('\n') || [];
            const target = stackLines.find((l) =>
                l.includes('/src/') || l.includes('src\\')
            );
            if (target) {
                const match = target.match(/\((.*):(\d+):(\d+)\)/);
                if (match) {
                    const [, filepath, lineno] = match;
                    file = path.relative(process.cwd(), filepath);
                    line = lineno;
                }
            }

            func = stackLines[1]?.trim().split(' ')[1] || 'unknown';
            code = stackLines[1] || '';
        } catch (e) {
            console.warn('Stack trace parse failed', e);
        }


        const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
        const userAgent = request.headers['user-agent'] || 'unknown';
        const referer = request.headers['referer'] || 'n/a';


        const message = `⚠️ Ошибка: ${error.name}\n\n📄 Файл: ${file}\n🔢 Строка: ${line}\n🔧 Функция: ${func}\n\n💥 Код: ${code}\n\n📬 Сообщение: ${error.message}\n\n📍 URL: ${request.method} ${request.url}\n🧭 User-Agent: ${userAgent}\n🌍 IP: ${ip}\n🔗 Referer: ${referer}
        `;
        await this.telegram.sendMessage(message);
        console.log(message)
        const responseBody: ApiResponse<null> = {
            resultCode: EResultCode.ERROR,
            message: error.message,
        };
        response.status(status).json(responseBody);
    }
}
