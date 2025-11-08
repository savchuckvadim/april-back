export interface IBXRecentAvatar {
    url: string;
    color: string;
}

export interface IBXRecentMessage {
    id: number;
    text: string;
    file: boolean;
    author_id: number;
    attach: boolean;
    date: string;
    status: string;
}

export interface IBXRecentChat {
    id: number;
    name: string;
    owner: number;
    extranet: boolean;
    avatar: string;
    color: string;
    type: string;
    entity_type: string;
    entity_id: string;
    entity_data_1: string;
    entity_data_2: string;
    entity_data_3: string;
    mute_list: number[];
    manager_list: number[];
    date_create: string;
    message_type: string;
}

export interface IBXRecentLines {
    id: number;
    status: number;
    date_create: string;
}

export interface IBXRecentUser {
    id: number;
    name?: string;
    first_name?: string;
    last_name?: string;
    work_position?: string;
    color?: string;
    avatar?: string;
    gender?: string;
    birthday?: string;
    extranet?: boolean;
    network?: boolean;
    bot?: boolean;
    connector?: boolean;
    external_auth_id?: string;
    status?: string;
    idle?: string | false;
    last_activity_date?: string;
    mobile_last_date?: string | false;
    absent?: string | false;
}

export interface IBXRecentItem {
    id: string;
    chat_id?: number;
    type: 'user' | 'chat';
    avatar: IBXRecentAvatar;
    title: string;
    message: IBXRecentMessage;
    counter: number;
    pinned: boolean;
    unread: boolean;
    date_update: string;
    chat?: IBXRecentChat;
    lines?: IBXRecentLines;
    user?: IBXRecentUser;
    options: any[];
}

export interface IBXRecentListResponse {
    items: IBXRecentItem[];
    hasMore: boolean;
}

export interface IBXRecentListRequest {
    SKIP_OPENLINES?: 'Y' | 'N';
    SKIP_DIALOG?: 'Y' | 'N';
    SKIP_CHAT?: 'Y' | 'N';
    LAST_MESSAGE_DATE?: string;
}

