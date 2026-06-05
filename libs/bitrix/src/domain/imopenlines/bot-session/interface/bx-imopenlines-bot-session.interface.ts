// Типы методов imopenlines.bot.session.* — по документации Bitrix
// api-reference/imopenlines/openlines/chat-bots
// Требует scope `imopenlines`.

export interface IBXImOpenlinesSessionFinishRequest {
    CHAT_ID: number; // Идентификатор чата открытой линии
    CLIENT_ID?: string;
}

export interface IBXImOpenlinesSessionTransferRequest {
    CHAT_ID: number;
    USER_ID?: number; // Перевод на конкретного оператора
    QUEUE_ID?: number; // Перевод в очередь линии
    TRANSFER_ID?: number;
    LEAVE?: 'Y' | 'N'; // Покинуть ли бот чат после передачи
    CLIENT_ID?: string;
}

export interface IBXImOpenlinesSessionOperatorRequest {
    CHAT_ID: number;
    CLIENT_ID?: string;
}

export interface IBXImOpenlinesSessionMessageSendRequest {
    CHAT_ID: number;
    NAME?: string; // Имя отправителя (системного)
    MESSAGE?: string;
    CLIENT_ID?: string;
}

export interface IBXImOpenlinesSessionBoolResponse {
    result: boolean;
}

export interface IBXImOpenlinesSessionResultResponse {
    result: Record<string, unknown> | boolean | number;
}
