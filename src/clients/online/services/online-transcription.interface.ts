export interface IOnlineTranscription {
    id?: string;
    provider?: string;
    activity_id?: string;
    file_id?: string;
    in_comment?: string;
    status?: string;
    text?: string;
    symbols_count?: number;
    price?: number;
    duration?: string;
    domain?: string;
    user_id?: string;
    user_name?: string;
    entity_type?: string;
    entity_id?: string;
    entity_name?: string;

    app?: string;
    department?: string;
    portal_id?: string;
}