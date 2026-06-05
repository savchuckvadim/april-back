// Типы метода imbot.* (жизненный цикл бота) — по документации Bitrix
// api-reference/chat-bots/outdated/bots

export type EBXImBotType = 'B' | 'O' | 'H' | 'S';

export interface IBXImBotProperties {
    NAME?: string; // Имя бота (NAME или LAST_NAME обязателен)
    LAST_NAME?: string; // Фамилия бота
    COLOR?: string; // Цвет в мобильном интерфейсе (RED, GREEN, ...)
    EMAIL?: string; // Email бота (не должен совпадать с email реального пользователя)
    PERSONAL_BIRTHDAY?: string; // YYYY-MM-DD
    WORK_POSITION?: string; // Должность/описание бота
    PERSONAL_WWW?: string; // Ссылка на сайт
    PERSONAL_GENDER?: 'M' | 'F';
    PERSONAL_PHOTO?: string; // Аватар в Base64
}

export interface IBXImBotRegisterRequest {
    CODE: string; // Строковый код бота, уникальный в рамках портала
    TYPE?: EBXImBotType; // Тип бота, по умолчанию 'B'
    OPENLINE?: 'Y' | 'N'; // Режим работы с открытыми линиями
    EVENT_HANDLER?: string; // Общий URL обработчика событий
    EVENT_MESSAGE_ADD: string; // URL обработчика ONIMBOTMESSAGEADD
    EVENT_MESSAGE_UPDATE?: string; // URL обработчика ONIMBOTMESSAGEUPDATE
    EVENT_MESSAGE_DELETE?: string; // URL обработчика ONIMBOTMESSAGEDELETE
    EVENT_WELCOME_MESSAGE: string; // URL обработчика ONIMBOTJOINCHAT
    EVENT_BOT_DELETE: string; // URL обработчика ONIMBOTDELETE
    CLIENT_ID?: string; // Только для вебхуков
    PROPERTIES: IBXImBotProperties; // Профиль бота
}

export interface IBXImBotRegisterResponse {
    result: number; // BOT_ID
}

export interface IBXImBotUnregisterRequest {
    BOT_ID: number;
    CLIENT_ID?: string;
}

export interface IBXImBotUnregisterResponse {
    result: boolean;
}

export interface IBXImBotUpdateFields {
    CODE?: string;
    EVENT_HANDLER?: string;
    EVENT_MESSAGE_ADD?: string;
    EVENT_MESSAGE_UPDATE?: string;
    EVENT_MESSAGE_DELETE?: string;
    EVENT_WELCOME_MESSAGE?: string;
    EVENT_BOT_DELETE?: string;
    PROPERTIES?: IBXImBotProperties;
}

export interface IBXImBotUpdateRequest {
    BOT_ID: number;
    FIELDS: IBXImBotUpdateFields;
    CLIENT_ID?: string;
}

export interface IBXImBotUpdateResponse {
    result: boolean;
}

export type IBXImBotListRequest = Record<string, never>;

export interface IBXImBotListItem {
    ID: string;
    CODE: string;
    TYPE: string;
    [key: string]: unknown;
}

export interface IBXImBotListResponse {
    result: IBXImBotListItem[];
}
