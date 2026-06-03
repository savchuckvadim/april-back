export type IBXImV2ChatType =
    | 'user'
    | 'chat'
    | 'open'
    | 'crm'
    | 'lines'
    | 'announcement'
    | 'channel';

export type IBXImV2ChatData = {
    id?: number;
    dialogId?: string;
    /** 'user' = личный чат, 'chat'/'open'/'crm'/... = групповой */
    type?: IBXImV2ChatType;
    /** 'P' = Private (личный), 'C' = Chat (групповой) */
    messageType?: string;
    name?: string;
    owner?: number;
    extranet?: boolean;
    entityType?: string;
};

export type IBXImV2MessageData = {
    id?: number;
    chatId?: number;
    authorId?: number;
    text?: string;
    isSystem?: boolean;
    params?: Record<string, unknown>;
};

export type IBXImV2UserData = {
    id?: number;
    active?: boolean;
    name?: string;
    bot?: boolean;
    type?: string;
    externalAuthId?: string;
};

/** Тело data события ONIMV2MESSAGEADD / ONIMV2MESSAGEUPDATE и др. */
export type IBXImV2EventPayload = {
    message?: IBXImV2MessageData;
    chat?: IBXImV2ChatData;
    user?: IBXImV2UserData;
    language?: string;
};

export interface IBXImV2Event {
    eventId?: number;
    type?: string;
    data?: IBXImV2EventPayload;
}

export type IBXImV2EventSubscribeRequest = Record<string, never>;

export interface IBXImV2EventSubscribeResponse {
    result?: boolean;
}

export interface IBXImV2EventGetRequest {
    limit: number;
    offset?: number;
}

export interface IBXImV2EventGetResponse {
    result?: {
        events?: IBXImV2Event[];
        nextOffset?: number;
        hasMore?: boolean;
    };
}
