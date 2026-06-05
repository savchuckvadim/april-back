// Типы методов imbot.v2.Command.* — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/imbot.v2/commands
import { IBXImBotV2MessageFields } from '../../message/interface/bx-imbot-v2-message.interface';

export interface IBXImBotV2CommandFields {
    command: string; // Команда без символа '/'
    title?: Record<string, string>; // { langCode: text }
    params?: Record<string, string>; // { langCode: text }
    common?: boolean;
    hidden?: boolean;
    extranetSupport?: boolean;
}

export interface IBXImBotV2CommandRegisterRequest {
    botId: number;
    botToken?: string;
    fields: IBXImBotV2CommandFields;
}

export interface IBXImBotV2CommandRegisterResponse {
    result: { commandId?: number; [key: string]: unknown };
}

export interface IBXImBotV2CommandUnregisterRequest {
    botId: number;
    botToken?: string;
    commandId: number;
}

export interface IBXImBotV2CommandUpdateRequest {
    botId: number;
    botToken?: string;
    commandId: number;
    fields: Partial<IBXImBotV2CommandFields>;
}

export interface IBXImBotV2CommandAnswerRequest {
    botId: number;
    botToken?: string;
    commandId: number;
    messageId: number;
    dialogId: string;
    fields?: IBXImBotV2MessageFields;
}

export type IBXImBotV2CommandListRequest = {
    botId?: number;
    botToken?: string;
};

export interface IBXImBotV2CommandBoolResponse {
    result: boolean;
}

export interface IBXImBotV2CommandListResponse {
    result: Record<string, unknown>[];
}
