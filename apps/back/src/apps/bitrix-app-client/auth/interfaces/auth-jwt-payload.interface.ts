export interface AuthJwtPayload {
    sub: number;
    client_id: number;
}

export interface EmailConfirmationJwtPayload {
    email: string;
}
