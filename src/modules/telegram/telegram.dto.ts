import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export enum EnumTelegramApp {
    KPI_SALES = 'kpi_sales',
    KONSTRUKTOR = 'konstruktor',
}

export class TelegramSendMessageDto {
    @ApiProperty({ description: 'Application name', type: String })
    @IsString()
    app: string;

    @ApiProperty({ description: 'Text message' })
    @IsString()
    @IsNotEmpty()
    text: string;

    @ApiProperty({ description: 'Domain', example: 'example.bitrix24.ru' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({ description: 'User ID' })
    @IsString()
    @IsNotEmpty()
    userId: string;
}
