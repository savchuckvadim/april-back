import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsArray, IsNumber } from 'class-validator';
import { PbxFieldEntityType } from '../pbx-field.entity';
import { PbxSalesEventFieldCode } from '../type/sales/event/pbx-sales-event-field.type';
import { PbxSalesKonstructorFieldCode } from '../type/sales/konstructor/pbx-sales-konstructor-field.type';

export type FieldGroup = 'sales' | 'service';
export type AppType = 'event' | 'konstructor';

export class InstallEntityFieldsDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Группа полей',
        enum: ['sales', 'service'],
        example: 'sales',
    })
    @IsEnum(['sales', 'service'])
    group: FieldGroup;

    @ApiProperty({
        description: 'Тип приложения',
        enum: ['event', 'konstructor'],
        example: 'event',
    })
    @IsEnum(['event', 'konstructor'])
    appType: AppType;

    @ApiPropertyOptional({
        description: 'Список сущностей для установки полей',
        enum: PbxFieldEntityType,
        isArray: true,
        example: [PbxFieldEntityType.COMPANY, PbxFieldEntityType.DEAL],
    })
    @IsOptional()
    @IsArray()
    @IsEnum(PbxFieldEntityType, { each: true })
    entities?: PbxFieldEntityType[];

    @ApiPropertyOptional({
        description: 'Список кодов полей для установки. Если не указан, устанавливаются все поля',
        type: [String],
        example: ['xo_name', 'xo_date'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    fieldCodes?: (PbxSalesEventFieldCode | PbxSalesKonstructorFieldCode)[];
}

export class InstallSmartFieldsDto {
    @ApiProperty({
        description: 'Домен портала',
        example: 'example.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Группа полей',
        enum: ['sales', 'service'],
        example: 'sales',
    })
    @IsEnum(['sales', 'service'])
    group: FieldGroup;

    @ApiProperty({
        description: 'Тип приложения',
        enum: ['event', 'konstructor'],
        example: 'event',
    })
    @IsEnum(['event', 'konstructor'])
    appType: AppType;

    @ApiPropertyOptional({
        description: 'Список entityTypeId smart сущностей для установки полей',
        type: [Number],
        example: [158, 134],
    })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    entityTypeIds?: number[];

    @ApiPropertyOptional({
        description: 'Список кодов полей для установки. Если не указан, устанавливаются все поля',
        type: [String],
        example: ['xo_name', 'xo_date'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    fieldCodes?: (PbxSalesEventFieldCode | PbxSalesKonstructorFieldCode)[];
}

export class InstallResultDto {
    @ApiProperty({
        description: 'Список успешно установленных полей (коды)',
        type: [String],
        example: ['xo_name', 'xo_date'],
    })
    success: string[];

    @ApiProperty({
        description: 'Список полей, которые не удалось установить (коды)',
        type: [String],
        example: ['op_work_status'],
    })
    failed: string[];
}

