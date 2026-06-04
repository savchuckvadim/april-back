export interface BitrixSecretEntity {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    group: string;
    type: string;
    code: string;
    client_id: string;
    client_secret: string;
}
