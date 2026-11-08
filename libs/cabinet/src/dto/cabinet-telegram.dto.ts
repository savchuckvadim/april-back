import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IssuedTelegramCode,
    TelegramBindingView,
} from '../telegram/cabinet-telegram-link.service';

export class CabinetTelegramCodeDto implements IssuedTelegramCode {
    @ApiProperty({
        description:
            'Одноразовый код привязки (8 символов, 10 минут). Отправить боту: /start КОД.',
        type: String,
        example: 'K7M2QX9P',
    })
    code!: string;

    @ApiPropertyOptional({
        description:
            'Ссылка, открывающая бота с готовым кодом; пусто — Telegram не сообщил имя бота, код вводится вручную: /start КОД.',
        type: String,
        example: 'https://t.me/april_clients_bot?start=K7M2QX9P',
        nullable: true,
    })
    deepLink!: string | null;

    @ApiPropertyOptional({
        description:
            'Имя бота без @ (приложение узнаёт его у Telegram по токену).',
        type: String,
        example: 'april_clients_bot',
        nullable: true,
    })
    botUsername!: string | null;

    @ApiProperty({
        description: 'Когда код истечёт (ISO).',
        type: String,
        example: '2026-11-08T09:40:00.000Z',
    })
    expiresAt!: string;
}

export class CabinetTelegramBindingDto implements TelegramBindingView {
    @ApiProperty({
        description: 'ID привязки.',
        type: String,
        example: '0b8f7c1e-6d4a-4f2b-8e9c-1a2b3c4d5e6f',
    })
    id!: string;

    @ApiPropertyOptional({
        description: 'ID сотрудника на портале Битрикс24.',
        type: String,
        example: '231',
        nullable: true,
    })
    bitrixUserId!: string | null;

    @ApiPropertyOptional({
        description: 'ID учётной записи кабинета.',
        type: Number,
        example: 17,
        nullable: true,
    })
    userId!: number | null;

    @ApiPropertyOptional({
        description: 'Ник в Telegram без @.',
        type: String,
        example: 'ivan_petrov',
        nullable: true,
    })
    telegramUsername!: string | null;

    @ApiPropertyOptional({
        description: 'Имя в Telegram на момент привязки.',
        type: String,
        example: 'Иван Петров',
        nullable: true,
    })
    displayName!: string | null;

    @ApiPropertyOptional({
        description: 'Откуда привязали: frame — из Битрикса, site — с сайта.',
        type: String,
        example: 'frame',
        nullable: true,
    })
    createdBy!: string | null;

    @ApiPropertyOptional({
        description: 'Когда привязали (ISO).',
        type: String,
        example: '2026-11-08T09:31:00.000Z',
        nullable: true,
    })
    createdAt!: string | null;
}
