// Типы методов imbot.v2.File.* — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/imbot.v2/files

export interface IBXImBotV2FileUploadFields {
    name: string; // Имя файла с расширением
    content: string; // Содержимое в Base64 (до 100 МБ)
    message?: string; // Текст сообщения вместе с файлом
}

export interface IBXImBotV2FileUploadRequest {
    botId: number;
    botToken?: string;
    dialogId: string;
    fields: IBXImBotV2FileUploadFields;
}

export interface IBXImBotV2FileUploadResponse {
    result: { fileId?: number; [key: string]: unknown };
}

export interface IBXImBotV2FileDownloadRequest {
    botId: number;
    botToken?: string;
    fileId: number;
}

export interface IBXImBotV2FileDownloadResponse {
    result: Record<string, unknown>;
}
