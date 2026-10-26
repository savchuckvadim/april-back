import type { BitrixService } from '@lib/bitrix';
import type {
    IBXImV2ChatMessage,
    IBXImV2ChatMessageTailResponse,
    IBXImV2ChatUser,
} from '@lib/bitrix/domain/chat/im-v2-chat-message';
import { toSupportPlainText } from '../../monitor/domain/support-text.util';
import { supportDialogUrl } from '../../monitor/domain/support-signal.formatter';
import {
    authorRoleOf,
    portalHostOf,
} from '../../monitor/infrastructure/support-dialog.mapper';
import {
    SupportChatView,
    SupportParticipant,
} from '../domain/support-desk.types';

/** Сколько сообщений чата читать по умолчанию и максимум. */
export const SUPPORT_CHAT_READ_LIMIT = { fallback: 30, max: 50 } as const;

/** Клиента сессии здесь нет — клиент узнаётся по признаку коннектора. */
const NO_SESSION_CLIENT = -1;

/**
 * Чтение переписки одного чата линии (im.v2.Chat.Message.tail) для
 * разбора: читает и чаты, где пользователь ключа не участник.
 * Не Injectable: создаётся с инстансом Битрикса портала линии.
 */
export class SupportChatReader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly lineDomain: string,
    ) {}

    async read(chatId: number, limit: number): Promise<SupportChatView> {
        const response = await this.bitrix.imV2ChatMessage.tail({
            dialogId: `chat${chatId}`,
            limit: Math.min(
                SUPPORT_CHAT_READ_LIMIT.max,
                Math.max(1, Math.floor(limit)),
            ),
        });
        return this.toView(chatId, response.result);
    }

    private toView(
        chatId: number,
        tail: IBXImV2ChatMessageTailResponse | undefined,
    ): SupportChatView {
        const users = new Map<number, IBXImV2ChatUser>(
            (tail?.users ?? []).map(user => [user.id, user]),
        );
        const client = [...users.values()].find(user => user.connector);
        const messages = (tail?.messages ?? [])
            .filter((message: IBXImV2ChatMessage) =>
                Number.isFinite(new Date(message.date).getTime()),
            )
            .map(message => ({
                id: message.id,
                at: new Date(message.date),
                role: authorRoleOf(message, NO_SESSION_CLIENT, users),
                authorName: users.get(message.authorId)?.name ?? null,
                text: toSupportPlainText(message.text),
            }))
            .sort((left, right) => left.id - right.id);
        const participants: SupportParticipant[] = [...users.values()].map(
            user => ({
                id: user.id,
                name: user.name,
                role: user.connector
                    ? 'client'
                    : user.bot || user.type === 'bot'
                      ? 'other'
                      : 'staff',
            }),
        );

        return {
            domain: this.lineDomain,
            chatId,
            url: supportDialogUrl(this.lineDomain, chatId),
            client: client
                ? {
                      userId: client.id,
                      name: client.name,
                      portal: portalHostOf(client.website),
                  }
                : null,
            participants,
            messages,
            hasMore: Boolean(tail?.hasNextPage),
        };
    }
}
