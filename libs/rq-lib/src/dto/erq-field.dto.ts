import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsBoolean,
    IsArray,
    IsNumber,
    IsOptional,
    IsEnum,
    Allow,
} from 'class-validator';
import { IncludesEnum } from './includes.enum';

export class ERQField {
    @ApiProperty({
        description: 'Тип поля',
        example: 'string',
    })
    @IsString()
    @IsOptional()
    type: string;

    @ApiProperty({
        description: 'Название поля',
        example: 'ИНН',
    })
    @IsString()
    @IsOptional()
    name: string;

    @ApiProperty({
        description:
            'Значение поля (может быть строкой, числом, массивом или null)',
        example: '1234567890',
        required: false,
        type: String,
        nullable: true,
    })
    @IsOptional()
    @Allow()
    value: string | number | unknown[] | null;

    @ApiProperty({
        description: 'Код поля',
        example: 'inn',
    })
    @IsString()
    @IsOptional()
    code: string;

    @ApiProperty({
        description: 'Обязательное ли поле',
        example: true,
    })
    @IsBoolean()
    isRequired: boolean;

    @ApiProperty({
        description: 'Типы реквизитов, для которых это поле применимо',
        enum: IncludesEnum,
        isArray: true,
    })
    @IsArray()
    @IsEnum(IncludesEnum, { each: true })
    includes: IncludesEnum[];

    @ApiProperty({
        description: 'Группа поля',
        example: 'Основные данные',
        required: false,
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    group?: string | null;

    @ApiProperty({
        description: 'Активно ли поле',
        example: true,
        required: false,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean | null;

    @ApiProperty({
        description: 'Отключено ли поле',
        example: false,
        required: false,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    isDisable?: boolean | null;

    @ApiProperty({
        description: 'Порядок сортировки',
        example: 100,
        required: false,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    order?: number | null;

    constructor(data: Partial<ERQField> = {}) {
        this.type =
            data.code?.toLowerCase() === 'comments' ? 'text' : data?.type || '';
        this.name = data?.name || '';
        this.value = data?.value ?? '';
        this.code = data?.code || '';
        this.isRequired = data?.isRequired || false;
        this.includes = data?.includes || [];
        this.group = data?.group ?? null;
        this.isActive = data?.isActive ?? true;
        this.isDisable = data?.isDisable;
        this.order = data?.order ?? null;
    }
}
