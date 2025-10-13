import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EntityTypeId {
    PARTICIPANT = 1036,
}
export enum CategoryId {
    PARTICIPANT = 26,
}
export enum StageId {
    NEW = 'NEW', //Начало
    PREPARATION = 'PREPARATION', //Подготовка
    CLIENT = 'CLIENT', //Подготовка завершена
    UC_JLSIU6 = 'UC_JLSIU6', //Подтвержден
    SUCCESS = 'SUCCESS', //Подготовка завершена
    FAIL = 'FAIL', //Подготовка завершена
}

export class SmartItemDto {
    @ApiProperty({ name: 'title', example: 'Test' })
    @IsNotEmpty()
    @IsString()
    title: string;

    @ApiProperty({ name: 'ufCrm12AccountantGos', example: ['Test'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ufCrm12AccountantGos?: string[];

    @ApiProperty({ name: 'ufCrm12AccountantMedical', example: ['Test'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ufCrm12AccountantMedical?: string[];

    @ApiProperty({ name: 'ufCrm12Zakupki', example: ['Test'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ufCrm12Zakupki?: string[];

    @ApiProperty({ name: 'ufCrm12Kadry', example: ['Test'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ufCrm12Kadry?: string[];

    @ApiProperty({ name: 'ufCrm12Days', example: ['Test'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ufCrm12Days?: string[];

    @ApiProperty({ name: 'ufCrm12Format', example: ['Test'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    ufCrm12Format?: string[];

    @ApiProperty({ name: 'ufCrm12AddressForUdost', example: 'Test' })
    @IsOptional()
    @IsString()
    ufCrm12AddressForUdost?: string;

    @ApiProperty({ name: 'ufCrm12Phone', example: 'Test' })
    @IsOptional()
    @IsString()
    ufCrm12Phone?: string;

    @ApiProperty({ name: 'ufCrm12Email', example: 'Test' })
    @IsOptional()
    @IsString()
    ufCrm12Email?: string;

    @ApiProperty({ name: 'ufCrm12Comment', example: 'Test' })
    @IsOptional()
    @IsString()
    ufCrm12Comment?: string;

    @ApiProperty({ name: 'ufCrm12IsPpk', example: 'Test' })
    @IsOptional()
    @IsString()
    ufCrm12IsPpk?: string;

    @ApiProperty({ name: 'ufCrm12Name', example: 'Test', description: 'ФИО' })
    @IsOptional()
    @IsString()
    ufCrm12Name?: string;

    @ApiProperty({ name: 'parentId2', example: 33962, description: 'dealId' })
    @IsOptional()
    @IsNumber()
    parentId2?: number;

    @ApiProperty({
        name: 'contactId',
        example: 44448,
        description: 'contactId',
    })
    @IsOptional()
    @IsNumber()
    contactId?: number;

    @ApiProperty({
        name: 'companyId',
        example: 350088,
        description: 'companyId',
    })
    @IsOptional()
    @IsNumber()
    companyId?: number;
}
export class AddSmartItemDto {
    @ApiProperty({ name: 'entityTypeId', enum: EntityTypeId })
    @IsEnum(EntityTypeId)
    entityTypeId: EntityTypeId;

    @ApiProperty({ name: 'item', type: SmartItemDto })
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => SmartItemDto)
    item: SmartItemDto;

    // @ApiProperty({ name: 'categoryId', enum: CategoryId })
    // @IsEnum(CategoryId)
    // categoryId: CategoryId

    // @ApiProperty({ name: 'stageId', enum: StageId })
    // @IsEnum(StageId)
    // stageId: StageId
}
