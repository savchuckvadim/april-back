import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { IRPA } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { FieldDto } from './field.dto';
import { CategoryDto } from './category.dto';

/** RPA-процесс, как его отдавал Laravel (raw btx_rpas с relations). */
export class RpaDto implements IRPA {
    @ApiProperty({ description: 'ID RPA в нашей БД', example: 8, type: Number })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Дата создания записи (ISO)',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    created_at!: string;

    @ApiProperty({
        description: 'Дата обновления записи (ISO)',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    updated_at!: string;

    @ApiProperty({
        description: 'Системное имя RPA',
        example: 'zakupki',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название RPA',
        example: 'Закупки',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'Код RPA для ассоциаций',
        example: 'zakupki',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({ description: 'Тип RPA', example: 'sales', type: String })
    @IsString()
    type!: string;

    @ApiProperty({
        description: 'Изображение RPA',
        example: 'logo.png',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    image!: string;

    @ApiProperty({
        description: 'ID RPA в Битрикс',
        example: 12,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    bitrixId!: number;

    @ApiProperty({
        description: 'typeId RPA в Битрикс',
        example: 'rpa_12',
        type: String,
    })
    @IsString()
    typeId!: string;

    @ApiProperty({
        description: 'Описание RPA',
        example: 'Процесс закупок',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    description!: string;

    @ApiProperty({
        description: 'entityTypeId RPA в Битрикс',
        example: 512,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    entityTypeId!: number;

    @ApiProperty({
        description: 'ID стадии-префикса (forStageId)',
        example: 512,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    forStageId!: number;

    @ApiProperty({
        description: 'forFilterId RPA',
        example: 512,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    forFilterId!: number;

    @ApiProperty({
        description: 'crmId RPA',
        example: 512,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    crmId!: number;

    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    portal_id!: number;

    @ApiProperty({
        description: 'Категории (воронки) RPA',
        type: [CategoryDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories!: CategoryDto[];

    @ApiProperty({ description: 'Пользовательские поля RPA', type: [FieldDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldDto)
    bitrixfields!: FieldDto[];
}
