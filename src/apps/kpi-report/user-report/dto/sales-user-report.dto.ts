import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { ReportGetFiltersDto } from "../../dto/kpi-report-request.dto";
import { Type } from "class-transformer";
import { FieldItem } from "../../dto/kpi.dto";


export class SalesUserReportActionFilterDto {

    @ApiProperty({ description: 'Код' })
    @IsString()
    code: string

    @ApiProperty({ description: 'Внутренний код' })
    @IsString()
    innerCode: string

    @ApiProperty({ description: 'Название' })
    @IsString()
    name: string

    // @ApiProperty({ description: 'Порядок' })
    // @IsNumber()

    // order: number

    @ApiProperty({ description: 'Действие', type: FieldItem })
    @ValidateNested()
    @Type(() => FieldItem)
    actionItem: FieldItem

    @ApiProperty({ description: 'Тип действия', type: FieldItem })
    @ValidateNested()
    @Type(() => FieldItem)
    actionTypeItem: FieldItem


}


export class SalesUserReportFiltersDto {
    @ApiProperty({ description: 'Дата начала периода' })
    @IsString()
    dateFrom: string;

    @ApiProperty({ description: 'Дата окончания периода' })
    @IsString()
    dateTo: string;

    @ApiProperty({ description: 'Действия', type: [SalesUserReportActionFilterDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SalesUserReportActionFilterDto)
    actions: SalesUserReportActionFilterDto[];


}
export class SalesUserReportStartResponseDto {
    constructor(operationId: string, listId: number, message: string, success: boolean) {
        this.operationId = operationId;
        this.listId = listId;
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

    @ApiProperty({ description: 'ID списка в битриксе' })
    @IsNumber()
    listId: number;
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



    @ApiProperty({ description: 'Фильтры отчета KPI (действия) если приходят пустые то будет выгрузка всех действий', type: SalesUserReportFiltersDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => SalesUserReportFiltersDto)
    filters?: SalesUserReportFiltersDto;
}

export class SalesUserReportJobDataDto extends SalesUserReportGetRequestDto {
    @ApiProperty({ description: 'Хэш' })
    @IsString()
    _hash: string;

}
