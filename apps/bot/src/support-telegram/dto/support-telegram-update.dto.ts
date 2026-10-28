import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import type {
    SupportTelegramCallbackQuery,
    SupportTelegramChat,
    SupportTelegramMessage,
    SupportTelegramRepliedMessage,
    SupportTelegramUpdate,
    SupportTelegramUser,
} from '@lib/support';

/**
 * Обновление Telegram Bot API, как его присылает вебхук: имена полей —
 * как у Telegram (snake_case). ValidationPipe с whitelist оставляет
 * только описанные здесь поля — остальное бот не читает.
 */

export class TelegramUserDto implements SupportTelegramUser {
    @ApiProperty({
        description: 'Идентификатор пользователя Telegram.',
        type: Number,
        example: 123456789,
    })
    @IsInt()
    id!: number;

    @ApiPropertyOptional({
        description:
            'Имя пользователя Telegram; вместе с фамилией и ником идёт в ' +
            'подпись «подтвердил» в журнале.',
        type: String,
        example: 'Вадим',
    })
    @IsOptional()
    @IsString()
    first_name?: string;

    @ApiPropertyOptional({
        description:
            'Фамилия пользователя Telegram; дополняет имя в подписи «подтвердил».',
        type: String,
        example: 'Савчук',
    })
    @IsOptional()
    @IsString()
    last_name?: string;

    @ApiPropertyOptional({
        description: 'Ник без @.',
        type: String,
        example: 'vadim',
    })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiPropertyOptional({
        description: 'Пользователь — бот.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    is_bot?: boolean;
}

export class TelegramChatDto implements SupportTelegramChat {
    @ApiProperty({
        description:
            'Идентификатор чата: отрицательный — группа, положительный — личный чат.',
        type: Number,
        example: -1001234567890,
    })
    @IsInt()
    id!: number;

    @ApiPropertyOptional({
        description: 'Тип чата: private, group, supergroup.',
        type: String,
        example: 'supergroup',
    })
    @IsOptional()
    @IsString()
    type?: string;
}

export class TelegramRepliedMessageDto
    implements SupportTelegramRepliedMessage
{
    @ApiProperty({
        description: 'Номер сообщения, на которое ответили.',
        type: Number,
        example: 501,
    })
    @IsInt()
    message_id!: number;

    @ApiPropertyOptional({
        description: 'Автор исходного сообщения.',
        type: TelegramUserDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramUserDto)
    from?: TelegramUserDto;
}

export class TelegramMessageDto implements SupportTelegramMessage {
    @ApiProperty({
        description: 'Номер сообщения в чате.',
        type: Number,
        example: 502,
    })
    @IsInt()
    message_id!: number;

    @ApiProperty({ description: 'Чат сообщения.', type: TelegramChatDto })
    @ValidateNested()
    @Type(() => TelegramChatDto)
    chat!: TelegramChatDto;

    @ApiPropertyOptional({
        description: 'Автор сообщения.',
        type: TelegramUserDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramUserDto)
    from?: TelegramUserDto;

    @ApiPropertyOptional({
        description:
            'Текст сообщения: команда помощнику («что в поддержке», ' +
            '«разбери …») либо правка черновика, если это ответ на сообщение ' +
            'с черновиком.',
        type: String,
        example: 'разбери Соломатову',
    })
    @IsOptional()
    @IsString()
    text?: string;

    @ApiPropertyOptional({
        description:
            'Сообщение, на которое ответили: правка черновика ответом на него.',
        type: TelegramRepliedMessageDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramRepliedMessageDto)
    reply_to_message?: TelegramRepliedMessageDto;
}

export class TelegramCallbackQueryDto implements SupportTelegramCallbackQuery {
    @ApiProperty({
        description: 'Идентификатор нажатия кнопки.',
        type: String,
        example: '4382bfdwdsb323b2d9',
    })
    @IsString()
    id!: string;

    @ApiProperty({ description: 'Кто нажал.', type: TelegramUserDto })
    @ValidateNested()
    @Type(() => TelegramUserDto)
    from!: TelegramUserDto;

    @ApiPropertyOptional({
        description: 'Сообщение с кнопками.',
        type: TelegramMessageDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramMessageDto)
    message?: TelegramMessageDto;

    @ApiPropertyOptional({
        description: 'Данные кнопки: действие и черновик.',
        type: String,
        example: 'sa:send:a1b2c3d4e5f6',
    })
    @IsOptional()
    @IsString()
    data?: string;
}

export class SupportTelegramUpdateDto implements SupportTelegramUpdate {
    @ApiProperty({
        description: 'Номер обновления Telegram.',
        type: Number,
        example: 123456789,
    })
    @IsInt()
    update_id!: number;

    @ApiPropertyOptional({
        description: 'Новое сообщение.',
        type: TelegramMessageDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramMessageDto)
    message?: TelegramMessageDto;

    @ApiPropertyOptional({
        description: 'Нажатие кнопки под сообщением бота.',
        type: TelegramCallbackQueryDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramCallbackQueryDto)
    callback_query?: TelegramCallbackQueryDto;
}

export class SupportTelegramAckDto {
    @ApiProperty({
        description: 'Обновление принято в обработку.',
        type: Boolean,
        example: true,
    })
    accepted!: boolean;
}
