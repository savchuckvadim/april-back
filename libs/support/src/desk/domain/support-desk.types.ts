import type {
    SupportAuthorRole,
    SupportClient,
    SupportMessage,
} from '../../monitor/domain/support-dialog.types';

/** Участник чата линии глазами поддержки. */
export interface SupportParticipant {
    id: number;
    name: string;
    role: SupportAuthorRole;
}

/** Переписка одного чата линии для разбора человеком или ИИ. */
export interface SupportChatView {
    domain: string;
    chatId: number;
    url: string;
    /** Клиент чата (участник-коннектор); null — в хвосте его не видно. */
    client: SupportClient | null;
    participants: SupportParticipant[];
    /** По возрастанию id; сообщения всех сессий чата. */
    messages: SupportMessage[];
    /** Есть сообщения старше возвращённых. */
    hasMore: boolean;
}

/** Ответ клиенту ушёл. */
export interface SupportReplyResult {
    domain: string;
    chatId: number;
    messageId: number;
    /** Пользователь ключа присоединился к диалогу, чтобы ответить. */
    joined: boolean;
}

/** Задача на исправление на портале оповещений. */
export interface SupportTaskInput {
    title: string;
    description: string;
    responsibleId: number;
    /** Чат линии, из которого задача: ссылка попадёт в описание. */
    chatId?: number;
}

export interface SupportTaskResult {
    domain: string;
    taskId: number;
    url: string;
}
