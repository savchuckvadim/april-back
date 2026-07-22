import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';

/**
 * Тело запроса прокси-вызова произвольного метода REST API Bitrix.
 */
export class BitrixProxyCallDto {
    @ApiProperty({
        description:
            'Имя метода REST API Bitrix, который будет вызван на портале ' +
            'как есть, без маппинга на доменные сервисы. Например ' +
            '`crm.deal.get`, `crm.item.list`, `user.current`.',
        example: 'crm.deal.get',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-zA-Z][a-zA-Z0-9._]*$/, {
        message:
            'method должен быть валидным именем метода Bitrix (латиница, цифры, точки, подчёркивания)',
    })
    method: string;

    @ApiPropertyOptional({
        description:
            'Параметры метода Bitrix в том виде, в котором их ожидает ' +
            'REST API (filter, select, fields, id и т.д.). Передаются ' +
            'в запрос без изменений. Если не указаны — метод вызывается ' +
            'с пустым объектом параметров.',
        type: Object,
        example: { id: 123 },
    })
    @IsOptional()
    @IsObject()
    params?: Record<string, unknown>;
}

/**
 * Ответ прокси-вызова: эхо домена/метода и сырой результат Bitrix.
 */
export class BitrixProxyCallResponseDto {
    @ApiProperty({
        description: 'Домен портала Bitrix, на котором выполнен вызов.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Имя метода Bitrix, который был вызван.',
        example: 'crm.deal.get',
        type: String,
    })
    method: string;

    @ApiProperty({
        description:
            'Ответ REST API Bitrix как есть (обычно объект с ключами ' +
            '`result`, `time` и т.д.). Структура зависит от вызванного метода.',
        type: Object,
    })
    result: unknown;
}
