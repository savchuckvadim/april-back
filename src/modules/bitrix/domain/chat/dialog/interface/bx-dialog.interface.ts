// im.chat.add - Создает чат
export interface IBXChatAddRequest {
    USERS?: number[]; // Массив ID пользователей для добавления в чат
    TYPE?: 'OPEN' | 'CHAT'; // Тип чата: OPEN - открытый, CHAT - закрытый (по умолчанию CHAT)
    TITLE?: string; // Название чата
    DESCRIPTION?: string; // Описание чата
    COLOR?:
        | 'RED'
        | 'GREEN'
        | 'MINT'
        | 'LIGHT_BLUE'
        | 'DARK_BLUE'
        | 'PURPLE'
        | 'AQUA'
        | 'PINK'
        | 'LIME'
        | 'BROWN'
        | 'AZURE'
        | 'KHAKI'
        | 'SAND'
        | 'MARENGO'
        | 'GRAY'
        | 'GRAPHITE'; // Цвет чата
    MESSAGE?: string; // Первое сообщение в чате
    AVATAR?: string; // Аватар чата в формате base64
    ENTITY_TYPE?:
        | 'VIDEOCONF'
        | 'AI_ASSISTANT_PRIVATE'
        | 'LINES'
        | 'LIVECHAT'
        | 'ANNOUNCEMENT'
        | 'CALENDAR'
        | 'MAIL'
        | 'CRM'
        | 'SONET_GROUP'
        | 'TASKS'
        | 'CALL'; // Тип объекта для связи чата с внешним контекстом
    ENTITY_ID?: string; // Идентификатор объекта в рамках ENTITY_TYPE
    COPILOT_MAIN_ROLE?: string; // Код основной роли для BitrixGPT
}

export interface IBXChatAddResponse {
    result: number; // ID созданного чата
}

// im.chat.get - Получает идентификатор чата
export interface IBXChatGetRequest {
    ENTITY_TYPE:
        | 'VIDEOCONF'
        | 'AI_ASSISTANT_PRIVATE'
        | 'LINES'
        | 'LIVECHAT'
        | 'ANNOUNCEMENT'
        | 'CALENDAR'
        | 'MAIL'
        | 'CRM'
        | 'SONET_GROUP'
        | 'TASKS_TASK'
        | 'TASKS'
        | 'CALL'; // Тип объекта для связи чата с внешним контекстом
    ENTITY_ID: string; // Идентификатор объекта в рамках ENTITY_TYPE
}

export interface IBXChatGetResponse {
    result: {
        ID: number | null; // ID чата или null если чат не найден
    } | null;
}

// im.counters.get - Извлекает счетчики
export interface IBXCountersGetResponse {
    result: {
        TYPE: {
            [key: string]: number; // Общие счетчики по типам
        };
        CHAT: {
            [chatId: string]: number; // Счетчики для чатов. Ключ - ID чата, значение - количество непрочитанных сообщений
        };
        CHAT_MUTED: {
            [chatId: string]: number; // Счетчики для чатов с отключенными уведомлениями
        };
        CHAT_UNREAD: string[]; // Счетчики для чатов, помеченных как 'Непрочитано'
        LINES: {
            [lineId: string]: number; // Счетчики для чатов открытых линий
        };
        DIALOG: {
            [userId: string]: number; // Счетчики для диалогов один-на-один. Ключ - ID пользователя, значение - количество непрочитанных сообщений
        };
        DIALOG_UNREAD: string[]; // Счетчики для диалогов один-на-один, помеченных как 'Непрочитано'
    };
}

// im.dialog.get - Получает данные чата
export interface IBXDialogGetRequest {
    DIALOG_ID: string; // Идентификатор чата в формате: chatXXX - чат, sgXXX - группа или проект чат, XXX - идентификатор пользователя для личного чата
}

export interface IBXDialogGetResponse {
    result: {
        id: number;
        parent_chat_id: number;
        parent_message_id: number;
        name: string;
        description: string;
        owner: number;
        extranet: boolean;
        avatar: string;
        color: string;
        type: string;
        counter: number;
        user_counter: number;
        message_count: number;
        unread_id: number;
        restrictions: {
            avatar: boolean;
            rename: boolean;
            extend: boolean;
            call: boolean;
            mute: boolean;
            leave: boolean;
            leave_owner: boolean;
            send: boolean;
            user_list: boolean;
            path: string;
            path_title: string;
        };
        last_message_id: number;
        last_id: number;
        marked_id: number;
        disk_folder_id: number;
        entity_type: string;
        entity_id: string;
        entity_data_1: string;
        entity_data_2: string;
        entity_data_3: string;
        mute_list: number[];
        date_create: string;
        message_type: string;
        public: string;
        role: string;
        entity_link?: {
            type: string;
            url: string;
            id: string;
        };
        text_field_enabled: boolean;
        background_id: number | null;
        permissions: {
            manage_users_add: string;
            manage_users_delete: string;
            manage_ui: string;
            manage_settings: string;
            manage_messages: string;
            can_post: string;
        };
        is_new: boolean;
        readed_list: Array<{
            user_id: number;
            user_name: string;
            message_id: number;
            date: string | null;
        }>;
        manager_list: number[];
        last_message_views: {
            message_id: number;
            first_viewers: any[];
            count_of_viewers: number;
        };
        dialog_id: string;
    };
}
