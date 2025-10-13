import { BxAuthType } from '@/modules/bitrix/bitrix-service.factory';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class BitrixMethodDto {
    @ApiProperty({ description: 'Domain of the portal' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'Method of the bitrix' })
    @IsString()
    method: string;

    @ApiProperty({ description: 'Params of the bitrix' })
    @IsObject()
    bxData: any;

    @ApiProperty({ description: 'Auth type of the bitrix', required: false, enum: BxAuthType })
    @IsOptional()
    @IsEnum(BxAuthType)
    authType: BxAuthType;
}
