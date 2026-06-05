// Типы методов imbot.message.* — по документации Bitrix
// api-reference/chat-bots/outdated/messages

export interface IBXImBotKeyboardButton {
    TEXT: string;
    COMMAND?: string;
    COMMAND_PARAMS?: string;
    LINK?: string;
    ACTION?: string;
    BG_COLOR?: string;
    TEXT_COLOR?: string;
    DISPLAY?: 'LINE' | 'BLOCK';
    WIDTH?: number;
    [key: string]: unknown;
}

export interface IBXImBotKeyboard {
    BUTTONS?: IBXImBotKeyboardButton[];
    [key: string]: unknown;
}

export type IBXImBotAttachBlock = Record<string, unknown>;

export type IBXImBotAttach =
    | { BLOCKS?: IBXImBotAttachBlock[]; [key: string]: unknown }
    | IBXImBotAttachBlock[]
    | string;

export interface IBXImBotMenuItem {
    TEXT: string;
    LINK?: string;
    COMMAND?: string;
    COMMAND_PARAMS?: string;
    [key: string]: unknown;
}

export type IBXImBotMenu = IBXImBotMenuItem[] | Record<string, unknown>;

export interface IBXImBotMessageAddRequest {
    BOT_ID?: number; // Если не указан — берётся первый бот приложения
    DIALOG_ID?: string; // USER_ID или chatXXX (обязателен без FROM/TO_USER_ID)
    FROM_USER_ID?: number; // Отправитель для приватного диалога (с TO_USER_ID)
    TO_USER_ID?: number; // Получатель для приватного диалога (с FROM_USER_ID)
    MESSAGE: string; // Текст сообщения
    ATTACH?: IBXImBotAttach; // Вложение (BLOCKS)
    KEYBOARD?: IBXImBotKeyboard; // Кнопки под сообщением
    MENU?: IBXImBotMenu; // Контекстное меню
    SYSTEM?: 'Y' | 'N'; // Системное сообщение
    URL_PREVIEW?: 'Y' | 'N'; // Rich-ссылки, по умолчанию 'Y'
    CLIENT_ID?: string;
}

export interface IBXImBotMessageAddResponse {
    result: number; // MESSAGE_ID
}

export interface IBXImBotMessageUpdateRequest {
    BOT_ID?: number;
    MESSAGE_ID: number;
    MESSAGE?: string;
    ATTACH?: IBXImBotAttach; // строковый тип уже включает 'N' (очистка вложения)
    KEYBOARD?: IBXImBotKeyboard | 'N';
    MENU?: IBXImBotMenu | 'N';
    URL_PREVIEW?: 'Y' | 'N';
    CLIENT_ID?: string;
}

export interface IBXImBotMessageUpdateResponse {
    result: boolean;
}

export interface IBXImBotMessageDeleteRequest {
    BOT_ID?: number;
    MESSAGE_ID: number;
    COMPLETE?: 'Y' | 'N'; // Полное удаление
    CLIENT_ID?: string;
}

export interface IBXImBotMessageDeleteResponse {
    result: boolean;
}

export interface IBXImBotMessageLikeRequest {
    BOT_ID?: number;
    MESSAGE_ID: number;
    ACTION?: 'auto' | 'plus' | 'minus'; // По умолчанию auto
    CLIENT_ID?: string;
}

export interface IBXImBotMessageLikeResponse {
    result: boolean;
}
