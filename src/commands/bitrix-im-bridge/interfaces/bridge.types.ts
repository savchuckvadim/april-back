export type ImV2Event = {
    eventId?: number;
    type?: string;
    data?: Record<string, unknown>;
};

export type ImV2EventGetResponse = {
    result?: {
        events?: ImV2Event[];
        nextOffset?: number;
        hasMore?: boolean;
    };
};

export type DialogMessage = {
    id?: number;
    author_id?: number;
    text?: string;
    params?: Record<string, unknown>;
};

export type DialogMessagesGetResponse = {
    result?: {
        messages?: DialogMessage[];
    };
};

export type BridgeReplyContext = {
    domain: string;
    dialogId: string;
    bitrixMessageId?: number;
};
