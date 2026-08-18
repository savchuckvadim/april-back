import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export enum EnumTelegramApp {
    KPI_SALES = 'kpi_sales',
    KONSTRUKTOR = 'konstruktor',
}

/**
 * Лимиты длины полей — первая линия защиты публичной ручки /telegram:
 * тело с «портянкой» отсекается валидацией до всякой обработки.
 * Текст всё равно режется до TELEGRAM_MAX_MESSAGE_LENGTH перед отправкой —
 * лимит здесь совпадает с ним, чтобы клиент узнавал об обрезке честным 400,
 * а не молчаливым усечением.
 */
export const TELEGRAM_TEXT_MAX_LENGTH = 4000;
export const TELEGRAM_FIELD_MAX_LENGTH = 200;

export class TelegramSendMessageDto {
    @ApiProperty({
        type: String,
        description:
            'Маркер приложения-отправителя (например, event-sales-front) — ' +
            'по нему сообщение ищется в чате.',
        example: 'event-sales-front',
        maxLength: TELEGRAM_FIELD_MAX_LENGTH,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(TELEGRAM_FIELD_MAX_LENGTH)
    app: string;

    @ApiProperty({
        description: 'Text message',
        maxLength: TELEGRAM_TEXT_MAX_LENGTH,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(TELEGRAM_TEXT_MAX_LENGTH)
    text: string;

    @ApiProperty({
        description: 'Domain',
        example: 'example.bitrix24.ru',
        maxLength: TELEGRAM_FIELD_MAX_LENGTH,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(TELEGRAM_FIELD_MAX_LENGTH)
    domain: string;

    @ApiProperty({
        description: 'User ID',
        maxLength: TELEGRAM_FIELD_MAX_LENGTH,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(TELEGRAM_FIELD_MAX_LENGTH)
    userId: string;
}
