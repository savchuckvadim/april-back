export interface IBXImV2Event {
    type: string;
    data?: Record<string, unknown>;
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
    };
}
