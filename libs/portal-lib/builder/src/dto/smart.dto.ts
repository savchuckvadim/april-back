import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { IPSmart } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { FieldDto } from './field.dto';
import { CategoryDto } from './category.dto';

/** Смарт-процесс, как его отдавал Laravel SmartResource. */
export class SmartDto implements IPSmart {
    @ApiProperty({
        description: 'ID смарт-процесса в нашей БД',
        example: 4,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    portal_id!: number;

    @ApiProperty({
        description: 'Тип смарт-процесса (sales, service, seminars)',
        example: 'sales',
        type: String,
    })
    @IsString()
    type!: string;

    @ApiProperty({
        description: 'Группа смарт-процесса',
        example: 'sales',
        type: String,
    })
    @IsString()
    group!: string;

    @ApiProperty({
        description: 'Системное имя смарт-процесса',
        example: 'xo',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название смарт-процесса',
        example: 'ХО',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'ID смарт-процесса в Битрикс',
        example: 134,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    bitrixId!: number;

    @ApiProperty({
        description: 'entityTypeId смарт-процесса в Битрикс',
        example: 134,
        type: Number,
    })
    @IsNumber()
    entityTypeId!: number;

    @ApiProperty({
        description: 'ID стадии-префикса (forStageId)',
        example: 134,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    forStageId!: number;

    @ApiProperty({
        description: 'Префикс стадии (DT134_...)',
        example: 'DT134_14',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    forStage!: string;

    @ApiProperty({
        description: 'crmId смарт-процесса',
        example: 134,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    crmId!: number;

    @ApiProperty({
        description: 'Префикс CRM (T9c_...)',
        example: 'T9c',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    crm!: string;

    @ApiProperty({
        description: 'forFilterId смарт-процесса',
        example: 134,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    forFilterId!: number;

    @ApiProperty({
        description: 'Префикс фильтра (DYNAMIC_134_...)',
        example: 'DYNAMIC_134_',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    forFilter!: string;

    @ApiProperty({
        description: 'Поля смарт-процесса (дубль fields — так отдавал Laravel)',
        type: [FieldDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldDto)
    bitrixfields!: FieldDto[];

    @ApiProperty({ description: 'Поля смарт-процесса', type: [FieldDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldDto)
    fields!: FieldDto[];

    @ApiProperty({
        description: 'Категории (воронки) смарт-процесса',
        type: [CategoryDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CategoryDto)
    categories!: CategoryDto[];
}
