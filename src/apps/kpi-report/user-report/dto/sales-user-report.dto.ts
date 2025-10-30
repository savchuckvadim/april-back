import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean,  IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { ReportGetFiltersDto } from "../../dto/kpi-report-request.dto";
import { Type } from "class-transformer";
export class SalesUserReportStartResponseDto {
    constructor(operationId: string, message: string, success: boolean) {
        this.operationId = operationId;
        this.message = message;
        this.success = success;
    }
    @ApiProperty({ description: 'ID задачи' })
    @IsString()
    operationId: string;

    @ApiProperty({ description: 'Сообщение' })
    @IsString()
    message: string;

    @ApiProperty({ description: 'Успешно' })
    @IsBoolean()
    success: boolean;
}
export class SalesUserReportGetRequestDto {

    @ApiProperty({ description: 'Домен' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'ID сокета' })
    @IsString()
    socketId: string;

    @ApiProperty({ description: 'ID пользователя' })
    @IsNumber()
    userId: number;

    @ApiProperty({ description: 'Дата начала периода' })
    @IsString()
    dateFrom: string;

    @ApiProperty({ description: 'Дата окончания периода' })
    @IsString()
    dateTo: string;

    @ApiProperty({ description: 'Фильтры отчета KPI (действия) если приходят пустые то будет выгрузка всех действий', type: ReportGetFiltersDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => ReportGetFiltersDto)
    filters?: ReportGetFiltersDto;
}

export class SalesUserReportJobDataDto extends SalesUserReportGetRequestDto {
    @ApiProperty({ description: 'Хэш' })
    @IsString()
    _hash: string;

}
