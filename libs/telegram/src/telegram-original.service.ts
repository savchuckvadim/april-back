import { HttpService } from '@nestjs/axios';
import { Global, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TelegramSendMessageDto } from './telegram.dto';
import {
    TelegramSendWindow,
    toTelegramMarkdownText,
} from './telegram-message.util';

/**
 * Отправка НАПРЯМУЮ в Bot API независимо от WITH_TELEGRAM (ручка
 * /telegram/original). Второй вход в тот же канал, поэтому защита та же,
 * что у TelegramService: троттлинг-окно + текст, безопасный для Markdown,
 * + гарантия «ошибка отправки не роняет вызвавшего».
 */
@Global()
@Injectable()
export class TelegramOriginalService {
    private readonly logger = new Logger(TelegramOriginalService.name);
    private botToken: string;
    private adminChatId: string;
    private readonly sendWindow = new TelegramSendWindow();

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.botToken = this.configService.get<string>(
            'TELEGRAM_BOT_TOKEN',
        ) as string;
        this.adminChatId = this.configService.get<string>(
            'TELEGRAM_ADMIN_CHAT_ID',
        ) as string;
    }

    public async sendPublicMessage(dto: TelegramSendMessageDto) {
        const text = `\n💥 App:  ${dto.app}\n🌍 Domain:   ${dto.domain}\n🧭 UserId: ${dto.userId}\n\n ⚠️ Text:  ${dto.text}`;
        const cleanText = toTelegramMarkdownText(text);

        await this.post({
            chat_id: Number(this.adminChatId),
            text: `NEST from front ${cleanText}`,
            parse_mode: 'Markdown',
        });
        return cleanText;
    }

    async sendMessage(message: string) {
        await this.post({
            chat_id: Number(this.adminChatId),
            text: `NEST ${toTelegramMarkdownText(message)}`,
            parse_mode: 'Markdown',
        });
    }

    async sendMessageAdminError(message: string) {
        await this.post({
            chat_id: this.adminChatId,
            text: `NEST ADMIN ERROR: ${toTelegramMarkdownText(message)}`,
            parse_mode: 'Markdown',
        });
    }

    /** Единая точка отправки: троттлинг + «не уронить вызвавшего». */
    private async post(payload: unknown): Promise<void> {
        if (!this.sendWindow.tryConsume()) {
            this.logger.warn(
                'Telegram: лимит сообщений в минуту исчерпан — отправка пропущена',
            );
            return;
        }
        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        try {
            await firstValueFrom(this.httpService.post(url, payload));
        } catch (error) {
            // console, не this.logger.error: лог об ошибке отправки в
            // Telegram зациклил бы отправку через логгер-транспорт.
            console.error('Telegram error:', error);
        }
    }
}
