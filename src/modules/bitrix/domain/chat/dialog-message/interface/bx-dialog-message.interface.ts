export interface IBXDialogMessage {
    id: number;
    text: string;
    author_id?: number;
    date?: string;
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
