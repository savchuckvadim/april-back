export interface IBXDialogMessage {
    id?: number;
    text?: string;
    author_id?: number;
    date?: string;
    params?: Record<string, unknown>;
}

export interface IBXDialogMessagesGetRequest {
    DIALOG_ID: string;
    LIMIT?: number;
}

export interface IBXDialogMessagesGetResponse {
    result?: {
        messages?: IBXDialogMessage[];
    };
}
