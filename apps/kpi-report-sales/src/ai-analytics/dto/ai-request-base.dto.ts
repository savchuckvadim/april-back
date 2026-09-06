import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Общая часть запросов ai-analytics: домен портала и Bitrix-id
 * пользователя, от имени которого идёт запрос (план, 6.2/6.5). Права
 * проверяются на сервере по структуре отделов: руководитель видит свой
 * периметр, менеджер — только себя.
 */
export class AiRequestBaseDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Bitrix-id пользователя, запрашивающего данные (requester). ' +
            'По нему определяется периметр видимости: руководитель — ' +
            'все/отдел/группа, менеджер — только свои строки.',
        type: String,
        example: '447',
    })
    @IsString()
    @IsNotEmpty()
    requesterUserId: string;
}
