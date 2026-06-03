import { Injectable } from '@nestjs/common';
import { ImV2EventPayload } from '../../interfaces/bridge.types';

@Injectable()
export class BitrixImEventDataService {
    extractDialogId(data: ImV2EventPayload): string | undefined {
        if (data.chat?.dialogId) return data.chat.dialogId;
        if (data.message?.chatId) return `chat${data.message.chatId}`;
        return undefined;
    }

    extractMessageId(data: ImV2EventPayload): number | undefined {
        return data.message?.id;
    }

    extractAuthorId(data: ImV2EventPayload): string | undefined {
        const id = data.message?.authorId ?? data.user?.id;
        return id != null ? String(id) : undefined;
    }

    extractText(data: ImV2EventPayload): string | undefined {
        const text = data.message?.text;
        return text?.trim() ? text : undefined;
    }

    isSystemMessage(data: ImV2EventPayload, authorId?: string): boolean {
        if (!authorId || authorId === '0') return true;
        if (data.message?.isSystem) return true;
        const params = data.message?.params;
        if (!params) return false;
        return Boolean(params['CODE'] ?? params['code']);
    }

    isBotMessage(data: ImV2EventPayload): boolean {
        if (data.user?.bot === true) return true;
        if (data.user?.type?.toLowerCase() === 'bot') return true;
        return false;
    }

    isPrivateDialog(data: ImV2EventPayload): boolean {
        if (data.chat?.type === 'user') return true;
        if (data.chat?.messageType === 'P') return true;
        const dialogId = data.chat?.dialogId;
        if (dialogId && /^\d+$/.test(dialogId)) return true;
        if (dialogId && /^u\d+$/.test(dialogId)) return true;
        return false;
    }

    extractChatType(data: ImV2EventPayload): string | undefined {
        return data.chat?.type;
    }
}
