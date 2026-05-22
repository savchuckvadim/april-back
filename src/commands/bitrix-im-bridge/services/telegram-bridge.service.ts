import { Injectable, Logger } from '@nestjs/common';
import { TelegramChatBotService } from '@/modules/telegram-chat-bot';
import { BitrixImBridgeConfigService } from './config/bitrix-im-bridge-config.service';

export type IncomingBitrixMessagePayload = {
    domain: string;
    dialogId: string;
    authorId?: string;
    authorName?: string;
    text: string;
};

type SendMessageResult = {
    ok: boolean;
    messageId?: number;
    chatId?: number;
};

@Injectable()
export class TelegramBridgeService {
    private readonly logger = new Logger(TelegramBridgeService.name);

    constructor(
        private readonly bot: TelegramChatBotService,
        private readonly config: BitrixImBridgeConfigService,
    ) {}

    isConfigured(): boolean {
        return this.bot.isEnabled() && Boolean(this.config.getBridgeChatId());
    }

    async sendIncomingMessage(
        payload: IncomingBitrixMessagePayload,
    ): Promise<SendMessageResult> {
        if (!this.isConfigured()) {
            this.logger.warn(
                'Bridge Telegram bot не настроен. Пересылка пропущена.',
            );
            return { ok: false };
        }

        const chatId = this.config.getBridgeChatId()!;
        const text = this.formatIncomingMessage(payload);

        this.logger.debug(
            `Пересылка в Telegram: domain=${payload.domain}, dialog=${payload.dialogId}, author=${payload.authorId ?? 'unknown'}`,
        );

        const result = await this.bot.sendMessage(chatId, text);
        if (!result) return { ok: false };

        this.logger.log(
            `Пересылка в Telegram выполнена: tgMessageId=${result.messageId}, domain=${payload.domain}, dialog=${payload.dialogId}`,
        );
        return { ok: true, messageId: result.messageId, chatId: result.chatId };
    }

    async sendSystemMessage(text: string): Promise<void> {
        if (!this.isConfigured()) return;
        const chatId = this.config.getBridgeChatId()!;
        await this.bot.sendMessage(chatId, `ℹ️ ${text}`);
    }

    async registerWebhook(url: string): Promise<void> {
        await this.bot.setWebhook(url);
        this.logger.log(`Webhook зарегистрирован: ${url}`);
    }

    async getWebhookInfo(): Promise<Record<string, unknown>> {
        return this.bot.getWebhookInfo();
    }

    private formatIncomingMessage(payload: IncomingBitrixMessagePayload): string {
        const authorLine = payload.authorName
            ? `👤 <b>${this.escapeHtml(payload.authorName)}</b>`
            : payload.authorId
              ? `👤 ID: ${payload.authorId}`
              : '';

        const parts = [
            `📩 <b>${this.escapeHtml(payload.domain)}</b>`,
            `💬 Диалог: ${payload.dialogId}${authorLine ? ` · ${authorLine}` : ''}`,
            '━━━━━━━━━━━━━━━━━━━━',
            this.escapeHtml(payload.text || '[пустой текст]'),
        ];

        return parts.join('\n');
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
