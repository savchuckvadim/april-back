// Типы методов imbot.v2.Bot.* — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/imbot.v2/bots

export interface IBXImBotV2Properties {
    name: string; // Имя бота (обязательно)
    lastName?: string;
    workPosition?: string; // Должность/описание
    color?: string;
    gender?: 'M' | 'F';
    avatar?: string; // Base64
    [key: string]: unknown;
}

export type EBXImBotV2Type = 'bot' | 'human' | 'supervisor' | 'openline';
export type EBXImBotV2EventMode = 'fetch' | 'webhook';

export interface IBXImBotV2BotFields {
    code: string; // Уникальный код бота в рамках приложения
    botToken?: string; // Токен авторизации бота (для вебхуков)
    properties: IBXImBotV2Properties;
    type?: EBXImBotV2Type; // По умолчанию 'bot'
    eventMode?: EBXImBotV2EventMode; // 'fetch' (polling) | 'webhook'
    webhookUrl?: string; // Обязателен при eventMode='webhook'
    isHidden?: boolean;
    isReactionsEnabled?: boolean;
    isSupportOpenline?: boolean;
    backgroundId?: string;
}

export interface IBXImBotV2BotRegisterRequest {
    fields: IBXImBotV2BotFields;
}

export interface IBXImBotV2BotRegisterResponse {
    result: { botId?: number; [key: string]: unknown };
}

export interface IBXImBotV2BotUnregisterRequest {
    botId: number;
    botToken?: string;
}

export interface IBXImBotV2BotUpdateRequest {
    botId: number;
    botToken?: string;
    fields: Partial<IBXImBotV2BotFields>;
}

export interface IBXImBotV2BotGetRequest {
    botId: number;
    botToken?: string;
}

export type IBXImBotV2BotListRequest = Record<string, never>;

export interface IBXImBotV2BotBoolResponse {
    result: boolean;
}

export interface IBXImBotV2BotGetResponse {
    result: Record<string, unknown>;
}

export interface IBXImBotV2BotListResponse {
    result: Record<string, unknown>[];
}
