import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsDate, IsNumber, IsString } from "class-validator";
export class OrkUserReportStartResponseDto {
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
export class OrkUserReportGetRequestDto {

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
}

export class OrkUserReportJobDataDto extends OrkUserReportGetRequestDto {
    @ApiProperty({ description: 'Хэш' })
    @IsString()
    _hash: string;

}
