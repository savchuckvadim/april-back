import { OrkReportKpiData } from "./kpi.dto";
import { IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class GetOrkReportKpiResponseDto {
    @ApiProperty({ type: [OrkReportKpiData] , description: 'Report data'})
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrkReportKpiData)
    report: OrkReportKpiData[];
}
