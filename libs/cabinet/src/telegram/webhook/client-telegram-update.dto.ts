import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ClientTelegramUpdate } from '../client-telegram-update.handler';

/**
 * Обновление Telegram Bot API для клиентского бота (поля — как у Telegram,
 * snake_case). ValidationPipe с whitelist оставляет только описанное.
 */

export class ClientTelegramChatDto {
    @ApiProperty({
        description:
            'ID чата: положительный — личный чат, отрицательный — группа.',
        type: Number,
        example: 123456789,
    })
    @IsInt()
    id!: number;

    @ApiPropertyOptional({
        description: 'Тип чата: private, group, supergroup.',
        type: String,
        example: 'private',
    })
    @IsOptional()
    @IsString()
    type?: string;
}

export class ClientTelegramFromDto {
    @ApiPropertyOptional({
        description: 'Ник без @.',
        type: String,
        example: 'ivan_petrov',
    })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiPropertyOptional({ description: 'Имя.', type: String, example: 'Иван' })
    @IsOptional()
    @IsString()
    first_name?: string;

    @ApiPropertyOptional({
        description: 'Фамилия.',
        type: String,
        example: 'Петров',
    })
    @IsOptional()
    @IsString()
    last_name?: string;
}

export class ClientTelegramMessageDto {
    @ApiPropertyOptional({
        description: 'Текст сообщения: /start КОД, /stop или любой другой.',
        type: String,
        example: '/start K7M2QX9P',
    })
    @IsOptional()
    @IsString()
    text?: string;

    @ApiProperty({ description: 'Чат сообщения.', type: ClientTelegramChatDto })
    @ValidateNested()
    @Type(() => ClientTelegramChatDto)
    chat!: ClientTelegramChatDto;

    @ApiPropertyOptional({
        description: 'Автор сообщения.',
        type: ClientTelegramFromDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ClientTelegramFromDto)
    from?: ClientTelegramFromDto;
}

export class ClientTelegramUpdateDto implements ClientTelegramUpdate {
    @ApiProperty({
        description: 'Номер обновления Telegram.',
        type: Number,
        example: 100500,
    })
    @IsInt()
    update_id!: number;

    @ApiPropertyOptional({
        description:
            'Новое сообщение (остальные типы обновлений бот не читает).',
        type: ClientTelegramMessageDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ClientTelegramMessageDto)
    message?: ClientTelegramMessageDto;
}

export class ClientTelegramAckDto {
    @ApiProperty({
        description: 'Обновление принято в обработку.',
        type: Boolean,
        example: true,
    })
    accepted!: boolean;
}
