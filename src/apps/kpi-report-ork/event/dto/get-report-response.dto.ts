import { ReportData } from "./kpi.dto";
import { IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class GetReportResponseDto {
    @ApiProperty({ type: [ReportData] , description: 'Report data'})
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportData)
    report: ReportData[];
}
