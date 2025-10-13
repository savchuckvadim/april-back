export interface BitrixPlacementEntity {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    bitrix_app_id: bigint;
    code: string;
    type: string;
    group: string;
    status: string;
    bitrix_heandler: string;
    public_heandler: string;
    bitrix_codes: string;
    bitrix_app?: any; // BitrixApp entity
    settings?: any[]; // BitrixSetting entities
}
