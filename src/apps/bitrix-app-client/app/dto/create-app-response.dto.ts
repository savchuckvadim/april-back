import { BitrixAppDto } from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import {
    BitrixTokenDto,
    BitrixTokenEntity,
} from '@/modules/bitrix-setup/token';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export class CreateAppResponseDto {
    constructor({
        app,
        secrets,
        message,
    }: {
        app: BitrixAppDto;
        secrets: BitrixTokenEntity | null;
        message: string;
    }) {
        this.app = app;
        this.secrets = secrets
            ? {
                  access_token: secrets.access_token,
                  refresh_token: secrets.refresh_token,
                  expires_at: secrets.expires_at?.toISOString() ?? '',
                  application_token: secrets.application_token ?? '',
                  member_id: secrets.member_id ?? '',
              }
            : null;
        this.message = message;
    }
    @ApiProperty({
        description: 'App',
        type: BitrixAppDto,
    })
    @ValidateNested()
    @Type(() => BitrixAppDto)
    app: BitrixAppDto;
    @ApiProperty({
        description: 'Secrets',
        type: BitrixTokenDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => BitrixTokenDto)
    secrets: BitrixTokenDto | null;
    @ApiProperty({
        description: 'Message',
        example: 'App created',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    message: string;
}
