import { Injectable, Logger } from '@nestjs/common';
import { TelegramWebhookUpdateDto } from '../../dto/bitrix-im-bridge.dto';
import { BitrixImBridgeStateService } from '../bitrix-im-bridge-state.service';
import { BridgeReplyContext } from '../../interfaces/bridge.types';

type ReplyRoutingResult = {
    text?: string;
    context?: BridgeReplyContext;
    message: string;
    ok: boolean;
};

@Injectable()
export class TelegramReplyRouterService {
    private readonly logger = new Logger(TelegramReplyRouterService.name);

    constructor(private readonly state: BitrixImBridgeStateService) {}

    async resolve(
        update: TelegramWebhookUpdateDto,
    ): Promise<ReplyRoutingResult> {
        const rawText = update.message?.text?.trim();
        const replyToMessageId = update.message?.reply_to_message?.message_id;
        const telegramChatId = update.message?.chat?.id;

        this.logger.debug(
            `resolve: text="${rawText ?? ''}", replyToMessageId=${String(replyToMessageId)}, chatId=${String(telegramChatId)}`,
        );

        if (!rawText) {
            return { ok: true, message: 'Skip empty message' };
        }

        const isCommandReply = rawText.toLowerCase().startsWith('/r ');
        const responseText = isCommandReply ? rawText.slice(3).trim() : rawText;

        if (!responseText) {
            return { ok: false, message: 'Reply text is empty' };
        }

        if (replyToMessageId) {
            const contextByReply = await this.state.getReplyContext(replyToMessageId);
            this.logger.debug(
                `contextByReply: replyToMessageId=${replyToMessageId}, found=${Boolean(contextByReply)}, domain=${contextByReply?.domain ?? 'n/a'}`,
            );
            if (contextByReply) {
                return {
                    ok: true,
                    message: 'Reply context resolved by reply_to_message',
                    context: contextByReply,
                    text: responseText,
                };
            }
            this.logger.warn(
                `Контекст ответа не найден в Redis для tgMessageId=${replyToMessageId}. Сообщение пропущено.`,
            );
        }

        if (isCommandReply && typeof telegramChatId === 'number') {
            const contextByChat =
                await this.state.getLastReplyContextByChat(telegramChatId);
            this.logger.debug(
                `contextByChat: chatId=${telegramChatId}, found=${Boolean(contextByChat)}`,
            );
            if (contextByChat) {
                return {
                    ok: true,
                    message: 'Reply context resolved by /r last chat context',
                    context: contextByChat,
                    text: responseText,
                };
            }
        }

        if (isCommandReply) {
            return {
                ok: false,
                message:
                    'No context for /r. Reply to forwarded message first or wait for a new one.',
            };
        }

        return {
            ok: true,
            message: 'Skip non-command message without reply context',
        };
    }
}
