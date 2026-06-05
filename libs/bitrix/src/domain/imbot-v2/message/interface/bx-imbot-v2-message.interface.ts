// Типы методов imbot.v2.Chat.Message.* — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/imbot.v2/messages

export type IBXImBotV2AttachBlock = Record<string, unknown>;
export type IBXImBotV2Attach = IBXImBotV2AttachBlock[];

export interface IBXImBotV2KeyboardButton {
    text: string;
    command?: string;
    commandParams?: string;
    link?: string;
    action?: string;
    bgColor?: string;
    textColor?: string;
    display?: 'line' | 'block';
    width?: number;
    [key: string]: unknown;
}

export type IBXImBotV2Keyboard = IBXImBotV2KeyboardButton[];

export interface IBXImBotV2MessageFields {
    message?: string; // До 20000 символов
    attach?: IBXImBotV2Attach;
    keyboard?: IBXImBotV2Keyboard;
    system?: boolean;
    urlPreview?: boolean;
    replyId?: number;
    templateId?: string;
    forwardIds?: Record<string, number>;
}

export interface IBXImBotV2MessageSendRequest {
    botId: number;
    botToken?: string;
    dialogId: string; // chat{chatId} или {userId}
    fields?: IBXImBotV2MessageFields;
}

export interface IBXImBotV2MessageSendResponse {
    result: { messageId?: number; [key: string]: unknown };
}

export interface IBXImBotV2MessageUpdateRequest {
    botId: number;
    botToken?: string;
    messageId: number;
    fields?: IBXImBotV2MessageFields;
}

export interface IBXImBotV2MessageDeleteRequest {
    botId: number;
    botToken?: string;
    messageId: number;
}

export interface IBXImBotV2MessageGetRequest {
    botId: number;
    botToken?: string;
    messageId: number;
}

export interface IBXImBotV2MessageGetContextRequest {
    botId: number;
    botToken?: string;
    messageId: number;
    range?: number;
}

export interface IBXImBotV2MessageReadRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
    messageId?: number;
}

export interface IBXImBotV2MessageReactionRequest {
    botId: number;
    botToken?: string;
    messageId: number;
    reaction: string; // Код реакции (like, kiss, laugh, ...)
}

export interface IBXImBotV2MessageBoolResponse {
    result: boolean;
}

export interface IBXImBotV2MessageGetResponse {
    result: Record<string, unknown>;
}
