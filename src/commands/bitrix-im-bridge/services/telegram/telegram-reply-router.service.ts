import { Injectable } from '@nestjs/common';
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
    constructor(private readonly state: BitrixImBridgeStateService) {}

    async resolve(
        update: TelegramWebhookUpdateDto,
    ): Promise<ReplyRoutingResult> {
        const rawText = update.message?.text?.trim();
        if (!rawText) {
            return { ok: true, message: 'Skip empty message' };
        }

        const replyToMessageId = update.message?.reply_to_message?.message_id;
        const telegramChatId = update.message?.chat?.id;
        const isCommandReply = rawText.toLowerCase().startsWith('/r ');
        const responseText = isCommandReply ? rawText.slice(3).trim() : rawText;

        if (!responseText) {
            return { ok: false, message: 'Reply text is empty' };
        }

        const contextByReply =
            await this.loadContextByReplyId(replyToMessageId);
        if (contextByReply) {
            return {
                ok: true,
                message: 'Reply context resolved by reply_to_message',
                context: contextByReply,
                text: responseText,
            };
        }

        if (isCommandReply && typeof telegramChatId === 'number') {
            const contextByChat =
                await this.state.getLastReplyContextByChat(telegramChatId);
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

    private async loadContextByReplyId(
        replyToMessageId?: number,
    ): Promise<BridgeReplyContext | undefined> {
        if (!replyToMessageId) return undefined;
        return await this.state.getReplyContext(replyToMessageId);
    }
}
