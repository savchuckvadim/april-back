import { ApiProperty } from '@nestjs/swagger';
import {
    IsNumber,
    IsString,
    IsArray,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ERQField } from './erq-field.dto';

export class ERQAddressItem {
    @ApiProperty({
        description: 'ID привязки адреса',
        example: 123,
    })
    @IsNumber()
    anchor_id: number;

    @ApiProperty({
        description: 'ID типа адреса',
        example: 6,
    })
    @IsNumber()
    type_id: number;

    @ApiProperty({
        description: 'Название типа адреса',
        example: 'Юридический адрес',
    })
    @IsString()
    @IsOptional()
    name_type: string;

    @ApiProperty({
        description: 'Поля адреса',
        type: [ERQField],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ERQField)
    fields: ERQField[];

    // constructor(data: Partial<ERQAddressItem> = {}) {
    //     this.anchor_id = data?.anchor_id || 0;
    //     this.type_id = data?.type_id || 0;
    //     this.name_type = data?.name_type || '';
    //     this.fields = data?.fields || [];
    // }
}

export class ERQAddress {
    @ApiProperty({
        description: 'Список адресов',
        type: [ERQAddressItem],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ERQAddressItem)
    items: ERQAddressItem[];

    @ApiProperty({
        description: 'Текущий адрес',
        type: ERQAddressItem,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQAddressItem)
    current: ERQAddressItem | null;

    constructor(data: Partial<ERQAddress> = {}) {
        this.items = data?.items || [];
        this.current = data?.current ?? null;
    }
}
