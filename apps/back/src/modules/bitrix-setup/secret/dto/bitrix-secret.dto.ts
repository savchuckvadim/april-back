import { IsString } from 'class-validator';

export class CreateBitrixSecretDto {
    @IsString()
    code: string;

    @IsString()
    group: string;

    @IsString()
    type: string;

    @IsString()
    client_id: string;

    @IsString()
    client_secret: string;
}

export class GetBitrixSecretDto {
    @IsString()
    code: string;
}
