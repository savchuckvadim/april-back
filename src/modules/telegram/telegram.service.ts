import { HttpService } from '@nestjs/axios';
import { Global, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TelegramSendMessageDto } from './telegram.dto';

@Global()
@Injectable()
export class TelegramService {
    private botToken: string;
    private adminChatId: string;

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
        const cleanText = this.cleanText(text);

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        const payload = {
            chat_id: Number(this.adminChatId),
            text: `NEST from front ${cleanText}`,
            parse_mode: 'Markdown',
        };

        try {
            await firstValueFrom(this.httpService.post(url, payload));
        } catch (error) {
            console.error('Telegram error:', error.message);
        }
        return cleanText;
    }

    async sendMessage(message: string) {
        const cleanText = this.cleanText(message);

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        const payload = {
            chat_id: Number(this.adminChatId),
            text: `NEST ${cleanText}`,
            parse_mode: 'Markdown',
        };

        try {
            await firstValueFrom(this.httpService.post(url, payload));
        } catch (error) {
            console.error('Telegram error:', error.message);
        }
    }
    async sendMessageAdminError(message: string) {
        const cleanText = this.cleanText(message);

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
        const payload = {
            chat_id: this.adminChatId,
            text: `NEST ADMIN ERROR: ${cleanText}`,
            parse_mode: 'Markdown',
        };

        try {
            await firstValueFrom(this.httpService.post(url, payload));
        } catch (error) {
            console.error('Telegram error:', error.message);
        }
    }

    private cleanText(text: string) {
        return text
            .replace(/_/g, '\\_')
            .replace(/\*/g, '\\*')
            .replace(/\[/g, '\\[')
            .replace(/`/g, '\\`')
            .replace(/[_*[\]()~`>#+=|{}.!\\]/g, '\\$&') // экранируем ВСЁ, что может сломать markdown
            .slice(0, 4000); // Telegram лимит: 4096 символов;
    }
}
