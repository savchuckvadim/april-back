import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsArray,
    IsOptional,
    ValidateNested,
    IsObject,
    IsDateString,
    IsNumberString,
    IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

import { BXUserDto } from '../../event/dto/get-report-request.dto';

export class ReportGetCommunicationsFiltersDto {
    @ApiProperty()
    @IsString()
    dateFrom: string;

    @ApiProperty()
    @IsString()
    dateTo: string;


    @ApiProperty({ type: [BXUserDto] })
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    @IsArray()
    departament: BXUserDto[];


}

export class GetReportCommunicationsRequestDto {
    @ApiProperty()
    @IsString()
    domain: string;

    @ApiProperty({ type: ReportGetCommunicationsFiltersDto })
    @ValidateNested()
    @Type(() => ReportGetCommunicationsFiltersDto)
    filters: ReportGetCommunicationsFiltersDto;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    socketId?: string;
}
