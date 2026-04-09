import { IsBxHookUserId } from '@/core/decorators/dto/bx-hook-user-id.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

export class HookAuthDto {
    @ApiProperty({ description: 'Domain of the Bitrix24 portal' })
    @IsString()
    domain: string;
    // client_endpoint: 'https://gsr.bitrix24.ru/rest/',
    // server_endpoint: 'https://oauth.bitrix24.tech/rest/',
    // member_id: 'd1affba697e56e33eb55983b26755ff2'
}

export class BxWebHookDto {
    @ApiProperty({ description: 'Authentication information' })
    @ValidateNested()
    @Type(() => HookAuthDto)
    auth: HookAuthDto;
}

export class BxWebHookQueryResponsibleIdDto {
    @ApiProperty({ description: 'Responsible ID' })
    @IsBxHookUserId()
    responsibleId: string;
}
