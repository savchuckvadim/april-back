import { Transform, Type } from "class-transformer";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { parseToISO } from "../lib/date-util";
import { ValidateNested, IsArray, ArrayNotEmpty, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { BXUserDto } from "./kpi-report-request.dto";



export class GetCallingStatisticFiltersDto {

    @ApiProperty({ type: [BXUserDto] })
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    @IsArray()
    @IsNotEmpty()
    departament: IBXUser[];

    @ApiProperty()
    @IsString()
    dateFrom: string;
  
    @ApiProperty()
    @IsString()
    dateTo: string;
    
    // @ApiProperty()
    // @Transform(({ value }) => parseToISO(value, -1))
    // dateFrom: string;

    // @ApiProperty()
    // @Transform(({ value }) => parseToISO(value))
    // dateTo: string;


}


export class GetCallingStatisticDto {
    @ApiProperty()
    domain: string;

    @ApiProperty({ type: GetCallingStatisticFiltersDto })
    @ValidateNested()
    @Type(() => GetCallingStatisticFiltersDto)
    filters: GetCallingStatisticFiltersDto;
}