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

    constructor(private readonly telegram: TelegramService) {}

    async catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        // if (exception instanceof BadRequestException) {
        //     const errorResponse = exception.getResponse();
        //     const details = typeof errorResponse === 'object'
        //         ? JSON.stringify(errorResponse, null, 2)
        //         : errorResponse;

        //     const message = `❌ Validation error:\n${details}`;
        //     this.logger.error(message);
        //     await this.telegram.sendMessage(message);

        //     return response.status(400).json(errorResponse);
        // }

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        // For streamed/binary responses (file downloads), headers/body may already be sent.
        // In this case we must not attempt to write a JSON error response.
        if (response.headersSent) {
            this.logger.warn(
                `Headers already sent, skip error response: ${request.method} ${request.url}`,
            );
            return;
        }

        const error =
            exception instanceof Error
                ? exception
                : new Error(JSON.stringify(exception));

        // Обработка валидационных ошибок
        if (
            exception instanceof BadRequestException &&
            typeof exception.getResponse === 'function'
        ) {
            return await this.handleValidationException(
                exception,
                request,
                response,
            );
        }

        // Разбор stack trace
        let file = '';
        let line = '';
        let func = '';
        let code = '';
        try {
            const stackLines = error.stack?.split('\n') || [];
            const target = stackLines.find(
                l => l.includes('/src/') || l.includes('src\\'),
            );
            if (target) {
                const match = target.match(/\((.*):(\d+):(\d+)\)/);
                if (match) {
                    const [, filepath, lineno] = match;
                    file = path.relative(process.cwd(), filepath);
                    line = lineno;
                }
            }

            func = stackLines[1]?.trim()?.split(' ')[1] || 'unknown';
            code = stackLines[1] || '';
        } catch (e) {
            console.warn('Stack trace parse failed', e);
        }

        const ip =
            request.headers['x-forwarded-for'] || request.socket.remoteAddress;
        const userAgent = this.headerToString(request.headers['user-agent']);
        const referer = this.headerToString(request.headers['referer'], 'n/a');
        const ipText = this.headerToString(ip, 'unknown');

        const message = `⚠️ Ошибка: ${error.name}\n\n📄 Файл: ${file}\n🔢 Строка: ${line}\n🔧 Функция: ${func}\n\n💥 Код: ${code}\n\n📬 Сообщение: ${error.message}\n\n📍 URL: ${request.method} ${request.url}\n🧭 User-Agent: ${userAgent}\n🌍 IP: ${ipText}\n🔗 Referer: ${referer}
        `;
        await this.telegram.sendMessage(message);
        console.log(message);
        const responseBody: ApiResponse<null> = {
            resultCode: EResultCode.ERROR,
            message: error.message,
        };
        response.status(status).json(responseBody);
    }

    private async handleValidationException(
        exception: BadRequestException,
        request: Request,
        response: Response,
    ) {
        if (response.headersSent) {
            this.logger.warn(
                `Headers already sent, skip validation response: ${request.method} ${request.url}`,
            );
            return;
        }

        const res = exception.getResponse();

        // const details = typeof res === 'object'
        //     ? JSON.stringify(res, null, 2)
        //     : res;

        const messageArray = this.getValidationMessages(res);

        const validationMessages = Array.isArray(messageArray)
            ? messageArray.join('\n- ')
            : String(messageArray);

        const fullMessage = `❌ Validation error:\n- ${validationMessages}\n\n📍 URL: ${request.method} ${request.url} `;
        this.logger.warn(fullMessage);
        await this.telegram.sendMessage(fullMessage);

        return response.status(400).json({
            resultCode: EResultCode.ERROR,
            message: 'Validation failed',
            errors: messageArray,
        });
    }

    private headerToString(
        value: string | string[] | undefined,
        fallback = 'unknown',
    ): string {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.join(', ');
        return fallback;
    }

    private getValidationMessages(res: unknown): string[] {
        if (typeof res !== 'object' || res === null || !('message' in res)) {
            return [];
        }

        const maybeMessage = (res as { message: unknown }).message;
        if (Array.isArray(maybeMessage)) {
            return maybeMessage.map(item => String(item));
        }
        if (typeof maybeMessage === 'string') {
            return [maybeMessage];
        }
        return [String(maybeMessage)];
    }
}
