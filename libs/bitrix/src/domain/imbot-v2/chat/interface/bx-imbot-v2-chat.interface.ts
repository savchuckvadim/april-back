// Типы методов imbot.v2.Chat.* (включая UI) — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/imbot.v2/chats и /ui

export interface IBXImBotV2ChatFields {
    title?: string;
    description?: string;
    color?: string;
    avatar?: string; // Base64
    userIds?: number[];
    ownerId?: number;
    message?: string;
}

export interface IBXImBotV2ChatAddRequest {
    botId: number;
    botToken?: string;
    fields?: IBXImBotV2ChatFields;
}

export interface IBXImBotV2ChatAddResponse {
    result: { chatId?: number; [key: string]: unknown };
}

export interface IBXImBotV2ChatGetRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
}

export interface IBXImBotV2ChatGetResponse {
    result: Record<string, unknown>;
}

export interface IBXImBotV2ChatLeaveRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
}

export interface IBXImBotV2ChatSetOwnerRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
    userId: number;
}

export interface IBXImBotV2ChatUpdateRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
    fields: IBXImBotV2ChatFields;
}

export interface IBXImBotV2ChatUsersRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
    userIds: number[];
}

export interface IBXImBotV2ChatUserListRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
}

export interface IBXImBotV2ChatInputActionNotifyRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
    statusMessageCode?: string;
    duration?: number;
}

export interface IBXImBotV2ChatTextFieldEnabledRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
    enabled: boolean;
}

export interface IBXImBotV2ChatBoolResponse {
    result: boolean;
}

export interface IBXImBotV2ChatUserListResponse {
    result: number[];
}
