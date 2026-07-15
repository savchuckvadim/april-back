import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';

/**
 * История звонков/комментариев по компании.
 * Замена legacy PHP `POST flow-front/history`.
 */
export class CompanyHistoryRequestDto {
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
}

export class HistoryItemDto {
    @ApiProperty({
        description: 'Идентификатор записи истории.',
        type: Number,
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Текст комментария/результата события.',
        type: String,
        example: 'Позвонили, договорились о презентации.',
    })
    comment: string;
}
