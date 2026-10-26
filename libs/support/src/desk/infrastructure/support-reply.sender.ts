import type { BitrixService } from '@lib/bitrix';
import { isBitrixAccessError } from './bitrix-error.util';

export interface SupportSendOutcome {
    messageId: number;
    joined: boolean;
}

/** id сообщения из ответа im.message.add: число или его строка. */
export function toMessageId(raw: unknown): number | null {
    const value =
        raw && typeof raw === 'object' && 'result' in raw
            ? (raw as { result: unknown }).result
            : raw;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Ответ клиенту в чат линии от имени пользователя ключа.
 *
 * Пишем через im.message.add. Если Битрикс отказал в доступе — ключ не
 * участник диалога (диалог взял другой оператор): присоединяемся
 * imopenlines.session.join и пробуем ОДИН раз снова. Диалог при этом не
 * переходит к ключу, оператор остаётся прежним.
 *
 * Не Injectable: создаётся с инстансом Битрикса портала линии.
 */
export class SupportReplySender {
    constructor(private readonly bitrix: BitrixService) {}

    async send(chatId: number, text: string): Promise<SupportSendOutcome> {
        try {
            return { messageId: await this.add(chatId, text), joined: false };
        } catch (error) {
            if (!isBitrixAccessError(error)) throw error;
        }
        await this.bitrix.imOpenlinesOperatorSession.join({ CHAT_ID: chatId });
        return { messageId: await this.add(chatId, text), joined: true };
    }

    private async add(chatId: number, text: string): Promise<number> {
        const response = await this.bitrix.message.add({
            DIALOG_ID: `chat${chatId}`,
            MESSAGE: text,
        });
        const messageId = toMessageId(response?.result);
        if (!messageId) {
            throw new Error('Битрикс не вернул номер отправленного сообщения');
        }
        return messageId;
    }
}
