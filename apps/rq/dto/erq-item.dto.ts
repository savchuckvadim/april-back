import { ApiProperty } from '@nestjs/swagger';
import {
    IsNumber,
    IsArray,
    IsOptional,
    ValidateNested,
    IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ERQField } from './erq-field.dto';
import { ERQAddress } from './erq-address.dto';
import { ERQBank } from './erq-bank.dto';
import { RQ_TYPE } from '../enums/rq-type.enum';

export class ERQItem {
    @ApiProperty({
        description: 'ID реквизита в Bitrix',
        example: 123,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    bx_id: number | null;

    @ApiProperty({
        description: 'Поля реквизита',
        type: [ERQField],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ERQField)
    fields: ERQField[];

    @ApiProperty({
        description: 'Адрес реквизита',
        type: ERQAddress,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQAddress)
    address: ERQAddress | null;

    @ApiProperty({
        description: 'Банковские реквизиты',
        type: ERQBank,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQBank)
    bank: ERQBank | null;

    @ApiProperty({
        description: 'ID пресета реквизита',
        example: 1,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    preset_id: number | null;

    @ApiProperty({
        description: 'Тип реквизита',
        example: RQ_TYPE.ORGANIZATION,
        required: false,
    })
    @IsOptional()
    @IsEnum(RQ_TYPE)
    type: RQ_TYPE;
    constructor(data: Partial<ERQItem> = {}) {
        this.bx_id = data?.bx_id ?? null;
        this.fields = data?.fields || [];
        this.address = data?.address ?? null;
        this.bank = data?.bank ?? null;
        this.preset_id = data?.preset_id ?? 1;
        this.type = data?.type ?? RQ_TYPE.ORGANIZATION;
    }
}

export class ERQCurrent {
    @ApiProperty({
        description: 'ID реквизита в Bitrix',
        example: 123,
    })
    @IsNumber()
    bx_id: number;

    @ApiProperty({
        description: 'Поля реквизита',
        type: [ERQField],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ERQField)
    fields: ERQField[];

    @ApiProperty({
        description: 'Адрес реквизита',
        type: ERQAddress,
    })
    @ValidateNested()
    @Type(() => ERQAddress)
    address: ERQAddress;

    @ApiProperty({
        description: 'Банковские реквизиты',
        type: ERQBank,
    })
    @ValidateNested()
    @Type(() => ERQBank)
    bank: ERQBank;

    constructor(data: Partial<ERQCurrent> = {}) {
        this.bx_id = data?.bx_id || 0;
        this.fields = data?.fields || [];
        this.address = data?.address as ERQAddress;
        this.bank = data?.bank as ERQBank;
    }
}

export class ERQObject {
    @ApiProperty({
        description: 'Список реквизитов',
        type: [ERQItem],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ERQItem)
    items: ERQItem[];

    @ApiProperty({
        description: 'Реквизит по умолчанию',
        type: ERQItem,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQItem)
    default: ERQItem | null;

    constructor(data: Partial<ERQObject> = {}) {
        this.items = data?.items || [];
        this.default = data?.default ?? null;
    }
}

export class ERQDTO {
    @ApiProperty({
        description: 'Реквизиты организации',
        type: ERQObject,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQObject)
    org: ERQObject | null;

    @ApiProperty({
        description: 'Реквизиты ИП',
        type: ERQObject,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQObject)
    ip: ERQObject | null;

    @ApiProperty({
        description: 'Реквизиты физического лица',
        type: ERQObject,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQObject)
    fiz: ERQObject | null;

    @ApiProperty({
        description: 'Текущий реквизит',
        type: ERQItem,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ERQItem)
    current: ERQItem | null;

    constructor(data: Partial<ERQDTO> = {}) {
        this.org = data?.org ?? null;
        this.ip = data?.ip ?? null;
        this.fiz = data?.fiz ?? null;
        this.current = data?.current ?? null;
    }
}

export class RqResponseDto {
    constructor(data: ERQDTO) {
        this.rqs = data;
    }
    @ApiProperty({
        description: 'Реквизиты',
        type: ERQDTO,
    })
    rqs: ERQDTO;
}
