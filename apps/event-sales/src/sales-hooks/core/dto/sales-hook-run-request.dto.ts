import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

/**
 * Базовое тело запуска хука из фрейма (кнопка). Конкретные хуки наследуют
 * и добавляют свои доменные поля/флаги.
 */
export class SalesHookRunRequestBaseDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix. По нему PBXService отдаёт инстанс ' +
            'Bitrix с ключами доступа портала.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Идентификатор операции от клиента. Повторный POST с тем же ' +
            'operationId вернёт уже существующую операцию, не выполняя ' +
            'хук второй раз. Если не передан — сгенерируется сервером.',
        example: '3a1f0c9e-6b1d-4b8e-9a71-2f6d2c1e5a10',
        type: String,
    })
    @IsOptional()
    @IsString()
    operationId?: string;

    @ApiPropertyOptional({
        description:
            'socketId WebSocket-подключения фрейма — для push-уведомления ' +
            'о завершении (события sales-hook:done / sales-hook:error). ' +
            'Без него фрейм просто поллит статус.',
        example: 'kJf3q2Zb1a2C3d4EAAAB',
        type: String,
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Идентификатор пользователя Bitrix, инициировавшего операцию.',
        example: 123,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    initiatorUserId?: number;
}
