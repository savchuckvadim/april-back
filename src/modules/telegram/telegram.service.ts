import { HttpService } from '@nestjs/axios';
import { Global, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TelegramSendMessagePublicDto } from './telegram.dto';

const publicUrl = 'https://back.april-dev.ru/api/telegram';
@Global()
@Injectable()
export class TelegramService {
    private adminChatId: string;
    private url: string;
    private withTelegram: boolean;
    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.withTelegram = this.configService.get<boolean>(
            'WITH_TELEGRAM',
        ) as boolean;
        this.init();
        console.log(this.withTelegram, 'withTelegram');
    }
    public async sendPublicMessage(dto: TelegramSendMessagePublicDto) {
        const text = `\n💥 App:  ${dto.app}\n🌍 Domain:   ${dto.domain}\n🧭 UserId: ${dto.userId}\n\n ⚠️ Text:  ${dto.text}`;
        const cleanText = this.cleanText(text);

        const payload = {
            ...dto,
            app: 'nest api prod',
        } as TelegramSendMessageDto;

        try {
            await firstValueFrom(this.httpService.post(this.url, payload));
        } catch (error) {
            console.error('Telegram error:', error);
        }
        return cleanText;
    }

    async sendMessage(message: string) {
        try {
            const payload = this.getPayload(message);
            await firstValueFrom(this.httpService.post(this.url, payload));
        } catch (error) {
            console.error('Telegram error:', error);
        }
    }
    async sendMessageAdminError(message: string) {
        try {
            const payload = this.getPayload(message);
            await firstValueFrom(this.httpService.post(this.url, payload));
        } catch (error) {
            console.error('Telegram error:', error);
        }
    }

    private getPayload(message: string) {
        const cleanText = this.cleanText(message);
        if (!this.withTelegram) {
            return {
                userId: '123',
                text: `NEST selecte el ${cleanText}`,
                app: 'nest api prod',
                domain: 'example.com',
            } as TelegramSendMessageDto;
        }
        return {
            chat_id: this.adminChatId,
            text: `NEST ADMIN ERROR: ${cleanText}`,
            parse_mode: 'Markdown',
        };
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

    private init() {
        this.initUrl();
        this.initAdminChatId();
    }

    private initUrl() {
        const botToken = this.configService.get<string>(
            'TELEGRAM_BOT_TOKEN',
        ) as string;

        this.url =
            this.withTelegram && botToken
                ? `https://api.telegram.org/bot${botToken}/sendMessage`
                : publicUrl;
    }

    private initAdminChatId() {
        const appName = this.configService.get<string>('APP_NAME') as string;

        this.adminChatId = this.withTelegram
            ? (this.configService.get<string>(
                  'TELEGRAM_ADMIN_CHAT_ID',
              ) as string)
            : appName;
    }
}
