import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    PbxFieldEntity,
    PbxFieldEntityType,
    PbxFieldItemEntity,
} from '../entity/pbx-field.entity';
import { EUserFieldType } from '@/modules/bitrix';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PbxFieldItemEntityDto {
    constructor(item: PbxFieldItemEntity) {
        this.name = item.name;
        this.title = item.title;
        this.code = item.code;
        this.bitrixfield_id = item.bitrixfield_id.toString();
        this.bitrixId = item.bitrixId.toString();
    }
    @ApiProperty({
        description: 'Field name',
        example: 'field_name',
        type: String,
    })
    @IsString()
    name: string;
    @ApiProperty({
        description: 'Field title',
        example: 'Field Title',
        type: String,
    })
    @IsString()
    title: string;
    @ApiProperty({
        description: 'Field code',
        example: 'field_code',
        type: String,
    })
    @IsString()
    code: string;
    @ApiProperty({
        description: 'Bitrix field ID',
        example: '123',
        type: String,
    })
    @IsString()
    bitrixfield_id: string;
    @ApiProperty({
        description: 'Bitrix ID',
        example: 'UF_CRM_123',
        type: String,
    })
    @IsString()
    bitrixId: string;
}

export class PbxFieldEntityDto {
    constructor(field: PbxFieldEntity) {
        this.name = field.name;
        this.title = field.title;
        this.code = field.code;
        this.type = field.type as EUserFieldType | 'multiple';
        this.isPlural = field.isPlural;
        this.bitrixId = field.bitrixId;
        this.bitrixCamelId = field.bitrixCamelId;
        this.entity_id = field.entity_id.toString();
        this.entity_type = field.entity_type;
        this.parent_type = field.parent_type;
        this.items = field.items.map(item => new PbxFieldItemEntityDto(item));
    }
    @ApiProperty({
        description: 'Field name',
        example: 'field_name',
        type: String,
    })
    @IsString()
    name: string;
    @ApiProperty({
        description: 'Field title',
        example: 'Field Title',
        type: String,
    })
    @IsString()
    title: string;
    @ApiProperty({
        description: 'Field code',
        example: 'field_code',
        type: String,
    })
    @IsString()
    code: string;
    @ApiProperty({
        description: 'Field type',
        example: EUserFieldType.ENUMERATION,
        enum: EUserFieldType,
        enumName: 'EUserFieldType',
    })
    @IsEnum(EUserFieldType)
    type: EUserFieldType | 'multiple';

    @ApiProperty({
        description: 'Field is plural',
        example: true,
        type: Boolean,
    })
    @ApiProperty({
        description: 'Field is plural',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isPlural: boolean;
    @ApiProperty({
        description: 'Bitrix ID',
        example: 'UF_CRM_123',
        type: String,
    })
    @IsString()
    bitrixId: string;
    @ApiProperty({
        description: 'Bitrix Camel ID',
        example: 'ufCrm123',
        type: String,
    })
    @IsString()
    bitrixCamelId: string;
    @ApiProperty({
        description: 'Entity ID',
        example: '1',
        type: String,
    })
    @IsString()
    entity_id: string;
    @ApiProperty({
        description: 'Entity type',
        example: PbxFieldEntityType.COMPANY,
        enum: PbxFieldEntityType,
        enumName: 'PbxFieldEntityType',
    })
    @IsString()
    entity_type: PbxFieldEntityType;
    @ApiProperty({
        description: 'Parent type',
        example: 'list',
        type: String,
    })
    @IsString()
    parent_type: string;
    @ApiProperty({
        description: 'Field items',
        type: [PbxFieldItemEntityDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldItemEntityDto)
    items: PbxFieldItemEntityDto[];
}
