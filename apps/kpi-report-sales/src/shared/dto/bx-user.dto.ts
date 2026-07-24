import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsString } from 'class-validator';

/**
 * Сотрудник отдела Bitrix в запросах отчётов (минимальный набор полей).
 * Общий DTO для модулей report / airtime / calling-statistic.
 */
export class BXUserDto {
    @ApiProperty({ description: 'ID пользователя Bitrix', example: '42' })
    @IsNumberString()
    ID: string;

    @ApiProperty({ description: 'Имя сотрудника', example: 'Иван' })
    @IsString()
    NAME: string;

    @ApiProperty({ description: 'Фамилия сотрудника', example: 'Петров' })
    @IsString()
    LAST_NAME: string;
}
