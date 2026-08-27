// Типы метода im.v2.File.upload — по документации Bitrix
// api-reference/chat-bots/chat-bots-v2/im.v2/files/file-upload

/** Файл и сопроводительное сообщение. */
export interface IBXImV2FileUploadFields {
    /** Имя файла с расширением. */
    name: string;
    /** Содержимое в Base64 (без префикса data:*;base64, до 100 МБ). */
    content: string;
    /** Текст сообщения, отправляемого вместе с файлом. */
    message?: string;
}

export interface IBXImV2FileUploadRequest {
    /**
     * ID диалога: групповой чат — `chat{chatId}`, личный — `{userId}`
     * (строкой). Файл уходит от имени владельца ключа приложения.
     */
    dialogId: string;
    fields: IBXImV2FileUploadFields;
}

export interface IBXImV2FileUploadResponse {
    result?: {
        dialogId?: string;
        chatId?: number;
        messageId?: number;
        file?: { id?: number; name?: string; urlDownload?: string };
    };
}
