import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

type SendMessageResult = {
    ok: boolean;
    messageId?: number;
    chatId?: number;
};

type IncomingBitrixMessagePayload = {
    domain: string;
    dialogId: string;
    authorId?: string;
    text: string;
};

type TelegramSendMessageApiResponse = {
    ok?: boolean;
    result?: {
        message_id?: number;
        chat?: {
            id?: number;
        };
    };
};

@Injectable()
export class TelegramBridgeService {
    private readonly logger = new Logger(TelegramBridgeService.name);
    private readonly token?: string;
    private readonly adminChatId?: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
        this.adminChatId = this.configService.get<string>(
            'TELEGRAM_ADMIN_CHAT_ID',
        );
    }

    isConfigured(): boolean {
        return Boolean(this.token && this.adminChatId);
    }

    async sendIncomingMessage(
        payload: IncomingBitrixMessagePayload,
    ): Promise<SendMessageResult> {
        if (!this.isConfigured()) {
            this.logger.warn(
                'Telegram bot credentials are missing. Skip forwarding.',
            );
            return { ok: false };
        }

        const text = [
            '📩 Новое сообщение из Bitrix24',
            `🌍 Портал: ${payload.domain}`,
            `💬 Диалог: ${payload.dialogId}`,
            payload.authorId ? `👤 Автор ID: ${payload.authorId}` : '',
            '',
            payload.text || '[пустой текст]',
        ]
            .filter(Boolean)
            .join('\n');

        const result = await this.sendRawMessage(text);
        this.logger.debug(
            `Forward to Telegram result: ok=${String(result.ok)}, domain=${payload.domain}, dialog=${payload.dialogId}, author=${payload.authorId || 'unknown'}, tgMessageId=${String(result.messageId)}`,
        );
        return result;
    }

    async sendSystemMessage(text: string): Promise<void> {
        await this.sendRawMessage(`ℹ️ ${text}`);
    }

    private async sendRawMessage(text: string): Promise<SendMessageResult> {
        if (!this.token || !this.adminChatId) {
            return { ok: false };
        }

        const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
        const body = {
            chat_id: Number(this.adminChatId),
            text: text.slice(0, 4000),
        };

        try {
            const response = await firstValueFrom(
                this.httpService.post(url, body),
            );
            const data = response.data as TelegramSendMessageApiResponse;
            const messageId = Number(data?.result?.message_id);
            const chatId = Number(data?.result?.chat?.id);
            return {
                ok: Boolean(data?.ok),
                messageId: Number.isFinite(messageId) ? messageId : undefined,
                chatId: Number.isFinite(chatId) ? chatId : undefined,
            };
        } catch (error) {
            this.logger.error(
                `Telegram sendMessage failed: chat=${this.adminChatId || 'n/a'}`,
                error,
            );
            return { ok: false };
        }
    }
}
