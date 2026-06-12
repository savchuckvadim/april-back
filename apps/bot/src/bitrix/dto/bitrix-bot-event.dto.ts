import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Входящее событие от Bitrix-бота (imbot).
 * Шаблон: реальные поля приходят формой application/x-www-form-urlencoded.
 */
export class BitrixBotEventDto {
    @ApiProperty({
        description: 'Код события Bitrix (например, ONIMBOTMESSAGEADD)',
        type: String,
        example: 'ONIMBOTMESSAGEADD',
    })
    @IsString()
    @IsNotEmpty()
    event!: string;

    @ApiProperty({
        description: 'Домен портала Bitrix, откуда пришло событие',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain!: string;

    @ApiProperty({
        description: 'Текст сообщения пользователя, если есть',
        type: String,
        required: false,
        example: 'Привет',
    })
    @IsOptional()
    @IsString()
    message?: string;
}

/**
 * Ответ-подтверждение приёма события ботом.
 */
export class BotAckResponseDto {
    @ApiProperty({
        description: 'Принято ли событие в обработку',
        type: Boolean,
        example: true,
    })
    accepted!: boolean;

    @ApiProperty({
        description: 'Канал, обработавший событие',
        type: String,
        example: 'bitrix',
    })
    channel!: string;
}
