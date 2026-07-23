import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsString,
    ValidateNested,
    IsNumber,
    IsOptional,
    IsNotEmpty,
} from 'class-validator';
import { IExcelReport } from '../types/excel-report.type';
import { DateRangeDto } from './kpi.dto';

export enum EDownloadType {
    EXCEL = 'excel',
    PDF = 'pdf',
}
export class DownloadReportKpiItemDto {
    @ApiProperty({ description: 'KPI ID' })
    @IsOptional()
    @IsString()
    id?: string;

    @ApiProperty({ description: 'KPI action' })
    @IsString()
    action: string;

    @ApiProperty({ description: 'KPI count' })
    @IsNumber()
    @IsOptional()
    count: number;
}

export class DownloadKpiReportItemDto implements IExcelReport {
    @ApiProperty({ description: 'Report ID - user id' })
    @IsNotEmpty()
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'User name' })
    @IsString()
    userName: string;

    @ApiProperty({
        description: 'KPI data',
        type: DownloadReportKpiItemDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DownloadReportKpiItemDto)
    kpi: DownloadReportKpiItemDto[];
}

export class ReportStructureGroupDto {
    @ApiProperty({ description: 'ID группы (отдела Bitrix)' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Название группы' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'ID сотрудников группы из report', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    userIds: number[];
}

export class ReportStructureDepartmentDto {
    @ApiProperty({ description: 'ID отдела продаж (отдела Bitrix)' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Название отдела' })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Группы отдела',
        type: [ReportStructureGroupDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportStructureGroupDto)
    groups: ReportStructureGroupDto[];

    @ApiProperty({
        description: 'ID сотрудников отдела вне групп из report',
        type: [Number],
    })
    @IsArray()
    @IsNumber({}, { each: true })
    userIds: number[];
}

export class ReportStructureDto {
    @ApiProperty({ description: 'Мультипортал (несколько ОП)' })
    @IsNotEmpty()
    isMultiple: boolean;

    @ApiProperty({
        description: 'Отделы продаж с группировкой сотрудников',
        type: [ReportStructureDepartmentDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportStructureDepartmentDto)
    departments: ReportStructureDepartmentDto[];
}

export class DownLoadKpiReportDto {
    @ApiProperty({ description: 'Download type', enum: EDownloadType })
    @IsEnum(EDownloadType)
    type: EDownloadType;

    @ApiProperty({
        description: 'Report data',
        type: [DownloadKpiReportItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DownloadKpiReportItemDto)
    report: DownloadKpiReportItemDto[];

    @ApiProperty({ description: 'Date range', type: DateRangeDto })
    @ValidateNested()
    @Type(() => DateRangeDto)
    @IsNotEmpty()
    date: DateRangeDto;

    @ApiProperty({
        description:
            'Структура отделов/групп для разбивки: мульти — лист на отдел с секциями групп, моно с группами — лист «По группам». Не передана — прежний одиночный лист.',
        type: ReportStructureDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ReportStructureDto)
    structure?: ReportStructureDto;
}
