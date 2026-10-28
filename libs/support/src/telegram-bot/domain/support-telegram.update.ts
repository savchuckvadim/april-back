/**
 * Входящее обновление Telegram глазами бота поддержки — только поля,
 * которые бот читает. Имена полей — как в Bot API (snake_case): DTO
 * приложения bot структурно совпадает с этими типами.
 */

export interface SupportTelegramUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot?: boolean;
}

export interface SupportTelegramChat {
    id: number;
    /** `private`, `group`, `supergroup`. */
    type?: string;
}

/** Сообщение, на которое ответили: нужны только номер и автор. */
export interface SupportTelegramRepliedMessage {
    message_id: number;
    from?: SupportTelegramUser;
}

export interface SupportTelegramMessage {
    message_id: number;
    chat: SupportTelegramChat;
    from?: SupportTelegramUser;
    text?: string;
    reply_to_message?: SupportTelegramRepliedMessage;
}

export interface SupportTelegramCallbackQuery {
    id: string;
    from: SupportTelegramUser;
    message?: SupportTelegramMessage;
    data?: string;
}

export interface SupportTelegramUpdate {
    update_id: number;
    message?: SupportTelegramMessage;
    callback_query?: SupportTelegramCallbackQuery;
}

/** Имя человека для журнала и подписи «подтвердил». */
export function telegramUserName(user?: SupportTelegramUser): string {
    if (!user) return 'неизвестный пользователь Telegram';
    const name = [user.first_name, user.last_name]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(' ')
        .trim();
    if (name) return user.username ? `${name} (@${user.username})` : name;
    return user.username ? `@${user.username}` : `Telegram #${user.id}`;
}
