import { IsString, IsOptional, IsNotEmpty, IsIn, ValidateNested, IsEnum, IsNumber } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BitrixTokenDto, BitrixTokenEntity } from '../../token';
import { Type } from 'class-transformer';
import { BITRIX_APP_CODES, BITRIX_APP_GROUPS, BITRIX_APP_STATUSES, BITRIX_APP_TYPES, VALID_APP_STATUSES, VALID_APP_TYPES } from '../enums/bitrix-app.enum';
import { CreateBitrixSecretDto } from '../../secret/dto/bitrix-secret.dto';
import { BitrixAppEntity } from '../model/bitrix-app.model';
import { PortalDto, } from '@/modules/portal-konstructor/portal/portal.entity';

export class CreateBitrixAppBaseDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Уникальный код приложения',
        example: BITRIX_APP_CODES.SALES,
        enum: BITRIX_APP_CODES,
    })
    @IsEnum(BITRIX_APP_CODES)
    @IsNotEmpty()
    code: BITRIX_APP_CODES;

    @ApiProperty({
        description: 'Группа приложения',
        example: BITRIX_APP_GROUPS.SALES,
        enum: BITRIX_APP_GROUPS,
    })
    @IsEnum(BITRIX_APP_GROUPS)
    group: BITRIX_APP_GROUPS;

    @ApiProperty({
        description: 'Тип приложения',
        example: BITRIX_APP_TYPES.KONSTRUCTOR,
        enum: BITRIX_APP_TYPES,
    })
    @IsEnum(BITRIX_APP_TYPES)
    type: BITRIX_APP_TYPES;

    @ApiProperty({
        description: 'Статус приложения',
        example: BITRIX_APP_STATUSES.ACTIVE,
        enum: BITRIX_APP_STATUSES,
    })
    @IsEnum(BITRIX_APP_STATUSES)
    status: BITRIX_APP_STATUSES;




}

export class CreateBitrixAppDto extends CreateBitrixAppBaseDto {

    @ApiProperty({
        description: 'Секреты приложения',
        type: CreateBitrixSecretDto,
    })
    @Type(() => CreateBitrixSecretDto)
    secret: CreateBitrixSecretDto;


}

export class CreateBitrixAppWithTokenDto extends CreateBitrixAppBaseDto {


    @ApiProperty({
        description: 'Токен приложения',
        type: BitrixTokenDto,
    })
    @ValidateNested()
    @Type(() => BitrixTokenDto)
    token: BitrixTokenDto;
}

export class GetBitrixAppDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Уникальный код приложения',
        example: BITRIX_APP_CODES.SALES,

        enum: BITRIX_APP_CODES,
    })
    @IsEnum(BITRIX_APP_CODES)
    code: BITRIX_APP_CODES;
}

export class UpdateBitrixAppDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description: 'Группа приложения',
        example: BITRIX_APP_GROUPS.SALES,
        enum: BITRIX_APP_GROUPS,
    })
    @IsOptional()
    @IsEnum(BITRIX_APP_GROUPS)
    group?: BITRIX_APP_GROUPS;

    @ApiPropertyOptional({
        description: 'Тип приложения',
        example: BITRIX_APP_TYPES.KONSTRUCTOR,
        enum: BITRIX_APP_TYPES,
    })
    @IsOptional()
    @IsEnum(BITRIX_APP_TYPES)
    type?: BITRIX_APP_TYPES;

    @ApiProperty({
        description: 'Уникальный код приложения',
        example: BITRIX_APP_CODES.SALES,

        enum: BITRIX_APP_CODES,
    })
    @IsEnum(BITRIX_APP_CODES)
    code: BITRIX_APP_CODES;

    @ApiPropertyOptional({
        description: 'Статус приложения',
        example: BITRIX_APP_STATUSES.ACTIVE,
        enum: BITRIX_APP_STATUSES,
    })
    @IsOptional()
    @IsEnum(BITRIX_APP_STATUSES)
    status?: BITRIX_APP_STATUSES;
}

export class BitrixAppDto {
    constructor(app: BitrixAppEntity, portal: PortalDto) {
        this.id = String(app?.id) || '';
        this.created_at = app.created_at;
        this.updated_at = app.updated_at;
        this.portal_id = String(app.portal_id) || '';
        this.group = app.group as BITRIX_APP_GROUPS;
        this.type = app.type as BITRIX_APP_TYPES;
        this.code = app.code as BITRIX_APP_CODES;
        this.status = app.status as BITRIX_APP_STATUSES;
        this.portal = portal as PortalDto ;
        // this.token = app.bitrix_tokens as BitrixTokenEntity;
        // this.placements = app.placements;
        // this.settings = app.settings;
    }
    @ApiProperty({
        description: 'ID приложения',
        example: '1',
        type: String,
    })

    @IsString()
    id: string;

    @ApiProperty({
        description: 'Дата создания',
        example: '2024-01-01T00:00:00.000Z',
        type: Date,
    })
    created_at?: Date;

    @ApiProperty({
        description: 'Дата обновления',
        example: '2024-01-01T00:00:00.000Z',
        type: Date,
    })
    updated_at?: Date;

    @ApiProperty({
        description: 'ID портала',
        example: '1',
        type: String,
    })
    portal_id: string;

    @ApiPropertyOptional({
        description: 'Группа приложения',
        example: BITRIX_APP_GROUPS.SALES,
        enum: BITRIX_APP_GROUPS,
    })
    @IsOptional()
    @IsEnum(BITRIX_APP_GROUPS)
    group?: BITRIX_APP_GROUPS;

    @ApiProperty({
        description: 'Тип приложения',
        example: BITRIX_APP_TYPES.KONSTRUCTOR,
        enum: BITRIX_APP_TYPES,
    })
    @IsEnum(BITRIX_APP_TYPES)
    type: BITRIX_APP_TYPES;

    @ApiProperty({
        description: 'Код приложения',
        example: BITRIX_APP_CODES.SALES,
        enum: BITRIX_APP_CODES,
    })
    @IsEnum(BITRIX_APP_CODES)
    code: BITRIX_APP_CODES;

    @ApiProperty({
        description: 'Статус приложения',
        example: BITRIX_APP_STATUSES.ACTIVE,
        type: String,
    })
    status: BITRIX_APP_STATUSES;

    @ApiPropertyOptional({
        description: 'Информация о портале',
        type: PortalDto,
    })
    portal?: PortalDto ;

    @ApiPropertyOptional({
        description: 'Токены приложения',
        type: Object,
    })
    token?: any;

    @ApiPropertyOptional({
        description: 'Размещения приложения',
        type: Array,
    })
    placements?: any[];

    @ApiPropertyOptional({
        description: 'Настройки приложения',
        type: Array,
    })
    settings?: any[];
}




