import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

export type TelegramSendOptions = {
    parseMode?: 'HTML' | 'Markdown';
};

export type TelegramSendResult = {
    messageId: number;
    chatId: number;
};

@Injectable()
export class TelegramChatBotService implements OnModuleInit {
    private readonly logger = new Logger(TelegramChatBotService.name);
    private bot?: Telegraf;

    constructor(private readonly config: ConfigService) {}

    onModuleInit(): void {
        const withTelegram = this.config.get<boolean>('WITH_TELEGRAM');
        if (!withTelegram) {
            this.logger.warn('WITH_TELEGRAM не задан — бот отключён');
            return;
        }
        const token = this.config.get<string>('TELEGRAM_CHAT_BOT_TOKEN');
        if (!token) {
            this.logger.warn('TELEGRAM_CHAT_BOT_TOKEN не задан — бот отключён');
            return;
        }
        this.bot = new Telegraf(token);
        this.logger.log('TelegramChatBot инициализирован');
    }

    isEnabled(): boolean {
        return Boolean(this.bot);
    }

    async sendMessage(
        chatId: number | string,
        text: string,
        options?: TelegramSendOptions,
    ): Promise<TelegramSendResult | undefined> {
        if (!this.bot) return undefined;

        try {
            const message = await this.bot.telegram.sendMessage(
                chatId,
                text.slice(0, 4096),
                { parse_mode: options?.parseMode ?? 'HTML' },
            );
            return { messageId: message.message_id, chatId: message.chat.id };
        } catch (error) {
            this.logger.error(
                `sendMessage failed: chatId=${String(chatId)}`,
                error,
            );
            return undefined;
        }
    }

    async setWebhook(url: string): Promise<void> {
        if (!this.bot) return;
        await this.bot.telegram.setWebhook(url);
        this.logger.log(`Webhook зарегистрирован: ${url}`);
    }

    async getWebhookInfo(): Promise<Record<string, unknown>> {
        if (!this.bot) return { enabled: false };
        const info = await this.bot.telegram.getWebhookInfo();
        return { enabled: true, ...info };
    }
}
