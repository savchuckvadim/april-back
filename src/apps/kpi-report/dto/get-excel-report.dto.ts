import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsString,
    ValidateNested,
    IsNumber,
    IsOptional,
    IsBoolean,
    IsDate,
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

export class DownLoadKpiReportDto {



    @ApiProperty({ description: 'Download type', enum: EDownloadType })
    @IsEnum(EDownloadType)
    type: EDownloadType;

    @ApiProperty({ description: 'Report data', type: [DownloadKpiReportItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DownloadKpiReportItemDto)
    report: DownloadKpiReportItemDto[];

    @ApiProperty({ description: 'Date range', type: DateRangeDto })
    @ValidateNested()
    @Type(() => DateRangeDto)
    @IsNotEmpty()
    date: DateRangeDto;
}
