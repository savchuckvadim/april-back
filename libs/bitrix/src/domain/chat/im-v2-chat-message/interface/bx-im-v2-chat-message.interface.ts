// Типы метода im.v2.Chat.Message.tail (scope `im`).
//
// ВНИМАНИЕ: метода нет в официальной документации REST (MCP b24-dev-mcp,
// 26.10.2026), но портал на него отвечает и пускает его в batch. Форма ответа
// снята с живого портала april-dev 26.10.2026 — описаны только поля, которые
// там видны. Выбран вместо im.dialog.messages.get по правилу владельца:
// где у Битрикса есть v2, берём v2. У v2 есть явный признак системного
// сообщения (`isSystem`) и признак коннектора у участника (`connector`).

export interface IBXImV2ChatMessageTailRequest {
    /** `chatXXX` — чат (в том числе диалог открытой линии), `XXX` — личный. */
    dialogId: string;
    /** Сколько последних сообщений вернуть. */
    limit?: number;
}

/** Сообщение чата. `authorId = 0` и `isSystem = true` — служебная строка. */
export interface IBXImV2ChatMessage {
    id: number;
    chatId: number;
    authorId: number;
    /** ISO 8601 со смещением портала: `2026-10-26T07:59:01+03:00`. */
    date: string;
    text: string;
    isSystem: boolean;
    uuid?: string | null;
    /** Пустые параметры портал отдаёт массивом `[]`, непустые — объектом. */
    params?: Record<string, unknown> | unknown[];
    unread?: boolean;
    viewed?: boolean;
    viewedByOthers?: boolean;
}

/**
 * Участник чата. Клиент открытой линии через коннектор: `type: 'extranet'`,
 * `connector: true`, `externalAuthId: 'imconnector'`; для канала Network в
 * `website` — адрес портала клиента.
 */
export interface IBXImV2ChatUser {
    id: number;
    active?: boolean;
    name: string;
    firstName?: string;
    lastName?: string;
    /** `user` — сотрудник портала, `extranet` — внешний, `bot` — бот. */
    type?: string;
    bot?: boolean;
    connector?: boolean;
    extranet?: boolean;
    network?: boolean;
    externalAuthId?: string;
    website?: string;
}

export interface IBXImV2ChatMessageTailResponse {
    /** От новых к старым. */
    messages: IBXImV2ChatMessage[];
    users: IBXImV2ChatUser[];
    /** Есть ли сообщения старше возвращённых. */
    hasNextPage: boolean;
    tariffRestrictions?: { isHistoryLimitExceeded: boolean };
}
