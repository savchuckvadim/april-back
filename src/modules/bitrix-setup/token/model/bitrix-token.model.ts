export interface IBitrixTokenEntity {
    id: string;
    created_at?: Date;
    updated_at?: Date;
    bitrix_app_id: string;
    client_id: string;
    client_secret: string;
    access_token: string;
    refresh_token: string;
    expires_at?: Date;
    application_token?: string | null;
    member_id?: string | null;
    bitrix_app?: any; // BitrixApp entity
}
export class BitrixTokenEntity implements IBitrixTokenEntity {
    id: string;
    created_at?: Date;
    updated_at?: Date;
    bitrix_app_id: string;
    client_id: string;
    client_secret: string;
    access_token: string;
    refresh_token: string;
    expires_at?: Date;
    application_token?: string | null;
    member_id?: string | null;
    bitrix_app?: any; // BitrixApp entity
}
