import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Входящее обновление от Telegram (шаблон, упрощённая модель update).
 */
export class TelegramUpdateDto {
    @ApiProperty({
        description: 'Идентификатор обновления Telegram (update_id)',
        type: Number,
        example: 123456789,
    })
    @IsInt()
    @IsNotEmpty()
    updateId!: number;

    @ApiProperty({
        description: 'Идентификатор чата, откуда пришло сообщение',
        type: Number,
        example: 987654321,
    })
    @IsInt()
    @IsNotEmpty()
    chatId!: number;

    @ApiProperty({
        description: 'Текст сообщения пользователя, если есть',
        type: String,
        required: false,
        example: '/start',
    })
    @IsOptional()
    @IsString()
    text?: string;
}

/**
 * Ответ-подтверждение приёма обновления Telegram-ботом.
 */
export class TelegramAckResponseDto {
    @ApiProperty({
        description: 'Принято ли обновление в обработку',
        type: Boolean,
        example: true,
    })
    accepted!: boolean;

    @ApiProperty({
        description: 'Канал, обработавший обновление',
        type: String,
        example: 'telegram',
    })
    channel!: string;
}
