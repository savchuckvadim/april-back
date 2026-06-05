// Типы методов imbot.command.* — по документации Bitrix
// api-reference/chat-bots/outdated/commands
import {
    IBXImBotAttach,
    IBXImBotKeyboard,
    IBXImBotMenu,
} from '../../message/interface/bx-imbot-message.interface';

export interface IBXImBotCommandLang {
    LANGUAGE_ID: string; // напр. 'en', 'ru'
    TITLE: string; // Название команды на языке
    PARAMS?: string; // Подсказка по параметрам
}

export interface IBXImBotCommandRegisterRequest {
    BOT_ID: number;
    COMMAND: string; // Текст команды (латиница/цифры, без пробелов)
    EVENT_COMMAND_ADD: string; // URL обработчика ONIMCOMMANDADD
    LANG: IBXImBotCommandLang[]; // Локализации
    COMMON?: 'Y' | 'N'; // Доступна в любых чатах, по умолчанию 'N'
    HIDDEN?: 'Y' | 'N'; // Скрытая команда, по умолчанию 'N'
    EXTRANET_SUPPORT?: 'Y' | 'N'; // Доступ для экстранет, по умолчанию 'N'
    CLIENT_ID?: string;
}

export interface IBXImBotCommandRegisterResponse {
    result: number; // COMMAND_ID
}

export interface IBXImBotCommandUnregisterRequest {
    COMMAND_ID: number;
    CLIENT_ID?: string;
}

export interface IBXImBotCommandUnregisterResponse {
    result: boolean;
}

export interface IBXImBotCommandUpdateFields {
    COMMAND?: string;
    COMMON?: 'Y' | 'N';
    HIDDEN?: 'Y' | 'N';
    EXTRANET_SUPPORT?: 'Y' | 'N';
    EVENT_COMMAND_ADD?: string;
    LANG?: IBXImBotCommandLang[];
}

export interface IBXImBotCommandUpdateRequest {
    COMMAND_ID: number;
    FIELDS: IBXImBotCommandUpdateFields;
    CLIENT_ID?: string;
}

export interface IBXImBotCommandUpdateResponse {
    result: boolean;
}

export interface IBXImBotCommandAnswerRequest {
    COMMAND_ID: number; // Обязателен, если не передан COMMAND
    COMMAND: string; // Обязателен, если не передан COMMAND_ID
    MESSAGE_ID: number; // Сообщение, на которое отвечаем
    MESSAGE?: string;
    ATTACH?: IBXImBotAttach;
    KEYBOARD?: IBXImBotKeyboard;
    MENU?: IBXImBotMenu;
    CLIENT_ID?: string;
}

export interface IBXImBotCommandAnswerResponse {
    result: boolean;
}
