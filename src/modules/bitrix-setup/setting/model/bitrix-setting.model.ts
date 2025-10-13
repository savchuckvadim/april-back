export interface BitrixSettingEntity {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    settingable_id: bigint;
    settingable_type: string;
    type?: string;
    code: string;
    status?: string;
    title?: string;
    description?: string;
    value?: string;
    settingable?: any; // Polymorphic relation
}
