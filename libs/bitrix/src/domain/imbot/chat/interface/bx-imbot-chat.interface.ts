// Типы методов imbot.chat.* — по документации Bitrix
// api-reference/chat-bots/outdated/chats

export type EBXImBotChatType = 'OPEN' | 'CHAT';

export interface IBXImBotChatAddRequest {
    TYPE?: EBXImBotChatType; // По умолчанию 'CHAT'
    TITLE?: string;
    DESCRIPTION?: string;
    COLOR?: string;
    MESSAGE?: string; // Приветственное сообщение
    USERS?: number[]; // Участники
    AVATAR?: string; // Base64
    ENTITY_TYPE?: string; // Привязка к внешнему объекту
    ENTITY_ID?: string;
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatAddResponse {
    result: number; // CHAT_ID
}

export interface IBXImBotChatGetRequest {
    ENTITY_TYPE: string;
    ENTITY_ID: string;
}

export interface IBXImBotChatData {
    ID?: string;
    TITLE?: string;
    OWNER?: string;
    ENTITY_TYPE?: string;
    ENTITY_ID?: string;
    [key: string]: unknown;
}

export interface IBXImBotChatGetResponse {
    result: IBXImBotChatData;
}

export interface IBXImBotChatLeaveRequest {
    CHAT_ID: number;
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatSendTypingRequest {
    DIALOG_ID: string; // USER_ID или chatXXX
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatSetOwnerRequest {
    CHAT_ID: number;
    USER_ID: number;
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatSetManagerRequest {
    CHAT_ID: number;
    USER_ID: number;
    IS_MANAGER?: 'Y' | 'N';
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatUpdateTitleRequest {
    CHAT_ID: number;
    TITLE: string;
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatUpdateColorRequest {
    CHAT_ID: number;
    COLOR: string;
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatUpdateAvatarRequest {
    CHAT_ID: number;
    AVATAR: string; // Base64
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatUserAddRequest {
    CHAT_ID: number;
    USERS: number[];
    HIDE_HISTORY?: 'Y' | 'N'; // По умолчанию 'Y'
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatUserDeleteRequest {
    CHAT_ID: number;
    USER_ID: number;
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatUserListRequest {
    CHAT_ID: number;
    BOT_ID?: number;
    CLIENT_ID?: string;
}

export interface IBXImBotChatBoolResponse {
    result: boolean;
}

export interface IBXImBotChatUserListResponse {
    result: number[];
}
