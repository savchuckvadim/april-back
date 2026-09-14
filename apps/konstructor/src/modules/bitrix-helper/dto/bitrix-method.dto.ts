import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';

/**
 * Тело `POST helper/bitrix/method` — прокси к REST Bitrix24 для dev-режима
 * легаси-фронта конструктора: вне iframe Bitrix у него нет `BX24.callMethod`,
 * поэтому те же (method, params) он шлёт сюда, а бэк ходит на портал
 * авторизацией из PBXService.
 */
export class BitrixMethodDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix24 без протокола. По нему PBXService ' +
            'находит авторизацию портала (вебхук или OAuth маркетплейса).',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Имя REST-метода Bitrix24 как есть — то, что в проде фронт ' +
            'передаёт первым аргументом `BX24.callMethod`.',
        example: 'crm.deal.get',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    method: string;

    @ApiProperty({
        description:
            'Параметры метода — второй аргумент `BX24.callMethod`. ' +
            'Уходят в Bitrix без изменений, структура зависит от метода.',
        example: { id: 100 },
        type: Object,
    })
    @IsObject()
    bxData: Record<string, unknown>;
}

/** Ответ `POST helper/bitrix/method`. */
export class BitrixMethodResponseDto {
    @ApiProperty({
        description:
            'Поле `result` из ответа Bitrix REST — то же, что фронт в проде ' +
            'получает как `answer.result` у `BX24.callMethod`. Форма зависит ' +
            'от метода: объект сущности, массив, число или boolean.',
        example: { ID: '100', TITLE: 'Гарант-Юрист' },
        type: Object,
    })
    result: unknown;
}
