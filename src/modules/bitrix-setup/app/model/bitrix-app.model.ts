import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BITRIX_APP_STATUSES, BITRIX_APP_TYPES } from '../enums/bitrix-app.enum';
import { IsEnum } from 'class-validator';
import { BitrixTokenEntity } from '../../token';


export interface IBitrixAppEntity {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    portal_id: bigint;
    group: string;
    type: string;
    code: string;
    status: string;
    portal?: any; // Portal entity
    bitrix_tokens?: BitrixTokenEntity; // BitrixToken entity
    placements?: any[]; // BitrixAppPlacement entities
    settings?: any[]; // BitrixSetting entities
}
export class BitrixAppEntity implements IBitrixAppEntity {
    id: bigint;
    created_at?: Date;
    updated_at?: Date;
    portal_id: bigint;
    group: string;
    type: string;
    code: string;
    status: string;
    bitrix_tokens?: BitrixTokenEntity; // BitrixToken entity
    placements?: any[]; // BitrixAppPlacement entities
    settings?: any[]; // BitrixSetting entities
    portal?: any; // Portal entity
}
export class BitrixAppDto {
    constructor(app: BitrixAppEntity) {
        this.id = app.id;
        this.created_at = app.created_at;
        this.updated_at = app.updated_at;
        this.portal_id = app.portal_id;
        this.group = app.group;
        this.type = app.type as BITRIX_APP_TYPES;
        this.code = app.code;
        this.status = app.status as BITRIX_APP_STATUSES;
        this.portal = app.portal;
        this.placements = app.placements || [];
        this.settings = app.settings || [];
    }

    @ApiProperty({
        description: 'ID приложения',
        example: 1,
        type: Number,
    })
    id: bigint;

    @ApiPropertyOptional({
        description: 'Дата создания',
        example: '2024-01-01T00:00:00.000Z',
        type: Date,
    })
    created_at?: Date;

    @ApiPropertyOptional({
        description: 'Дата обновления',
        example: '2024-01-01T00:00:00.000Z',
        type: Date,
    })
    updated_at?: Date;

    @ApiProperty({
        description: 'ID портала',
        example: 1,
        type: Number,
    })
    portal_id: bigint;

    @ApiProperty({
        description: 'Группа приложения',
        example: 'crm',
        type: String,
    })
    group: string;

    @ApiProperty({
        description: 'Тип приложения',
        example: BITRIX_APP_TYPES.WEBHOOK,
        enum: BITRIX_APP_TYPES,
    })
    @IsEnum(BITRIX_APP_TYPES)
    type: BITRIX_APP_TYPES;

    @ApiProperty({
        description: 'Код приложения',
        example: 'my_app',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Статус приложения',
        example: BITRIX_APP_STATUSES.ACTIVE,
        enum: BITRIX_APP_STATUSES,
    })
    @IsEnum(BITRIX_APP_STATUSES)
    status: BITRIX_APP_STATUSES;

    @ApiPropertyOptional({
        description: 'Информация о портале',
        type: Object,
    })
    portal?: any;

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
