import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';

/**
 * Счётчики результатов звонков пользователя по компании
 * (для меню «недозвон» и статистики результатов).
 * Замена legacy PHP `POST flow-front/result/count`.
 */
export class ResultCountRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Идентификатор компании Bitrix.',
        type: Number,
        example: 123,
    })
    @IsNumeric()
    companyId: number;

    @ApiProperty({
        description: 'Идентификатор пользователя Bitrix.',
        type: Number,
        example: 81,
    })
    @IsNumeric()
    userId: number;
}

export class CallResultsDto {
    @ApiProperty({
        description: 'Количество нерезультативных звонков.',
        type: Number,
        example: 2,
    })
    noresultCount: number;

    @ApiProperty({
        description: 'Количество результативных звонков.',
        type: Number,
        example: 5,
    })
    resultCount: number;

    @ApiProperty({
        description: 'Количество презентаций.',
        type: Number,
        example: 1,
    })
    presentationCount: number;

    @ApiProperty({
        description: 'Количество событий «в работе».',
        type: Number,
        example: 3,
    })
    inProgressCount: number;

    @ApiProperty({
        description: 'Количество событий «ожидание денег».',
        type: Number,
        example: 0,
    })
    inMoneyCount: number;
}
