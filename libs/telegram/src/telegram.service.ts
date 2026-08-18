import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TelegramSendMessageDto } from './telegram.dto';
import {
    TelegramSendWindow,
    toTelegramMarkdownText,
} from './telegram-message.util';

const publicUrl = 'https://back.april-dev.ru/api/telegram';

/**
 * Отправка сообщений в Telegram. Два режима (env WITH_TELEGRAM):
 *  - 'true' (прод) — напрямую в Bot API (TELEGRAM_BOT_TOKEN +
 *    TELEGRAM_ADMIN_CHAT_ID);
 *  - иначе (дев)  — пересылка на прод-бэк (publicUrl), который шлёт сам.
 *
 * Инварианты:
 *  - отправка НИКОГДА не роняет вызвавший поток: ошибка Telegram API — это
 *    потерянная тревога, а не сломанная бизнес-операция;
 *  - троттлинг-окно на все методы разом (см. TelegramSendWindow): защита
 *    и публичной ручки, и логгер-транспорта, и внутренних вызовов.
 */
@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);
    private adminChatId: string;
    private url: string;
    private withTelegram: boolean;
    private readonly sendWindow = new TelegramSendWindow();

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.withTelegram =
            this.configService.get<string>('WITH_TELEGRAM') === 'true';
        this.init();
    }

    public async sendPublicMessage(dto: TelegramSendMessageDto) {
        const text = `\n💥 App:  ${dto.app}\n🌍 Domain:   ${dto.domain}\n🧭 UserId: ${dto.userId}\n\n ⚠️ Text:  ${dto.text}`;
        const cleanText = toTelegramMarkdownText(text);

        const payload = this.withTelegram
            ? {
                  chat_id: this.adminChatId,
                  text: cleanText,
                  parse_mode: 'Markdown',
              }
            : /*
               * Пересылка на прод-бэк: `app` уходит КАК ЕСТЬ. Раньше он
               * перезаписывался на 'nest api prod', и маркер приложения
               * (event-sales-front и др.) терялся — по нему на той стороне
               * не находилось, кто прислал тревогу.
               */
              ({ ...dto, text: cleanText } as TelegramSendMessageDto);

        await this.post(payload);
        return cleanText;
    }

    async sendMessage(message: string) {
        await this.post(this.getPayload(message));
    }

    async sendMessageAdminError(message: string) {
        await this.post(this.getPayload(message));
    }

    /**
     * Единая точка отправки: троттлинг + гарантия «не уронить вызвавшего».
     * Все send-методы обязаны ходить через неё — иначе лимит обходится.
     */
    private async post(payload: unknown): Promise<void> {
        if (!this.sendWindow.tryConsume()) {
            // Не error: это штатная защита канала, а не сбой.
            this.logger.warn(
                'Telegram: лимит сообщений в минуту исчерпан — отправка пропущена',
            );
            return;
        }
        try {
            await firstValueFrom(this.httpService.post(this.url, payload));
        } catch (error) {
            // console, не this.logger.error: у логгера есть Telegram-транспорт,
            // и лог об ошибке отправки в Telegram зациклил бы отправку.
            console.error('Telegram error:', error);
        }
    }

    private getPayload(message: string) {
        const cleanText = toTelegramMarkdownText(message);
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
            text: `NEST Monorepo: ${cleanText}`,
            parse_mode: 'Markdown',
        };
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
