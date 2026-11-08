import { ApiProperty } from '@nestjs/swagger';
import {
    TELEGRAM_BOT_CHECK_STATUSES,
    TELEGRAM_BOT_KEYS,
    TELEGRAM_BOT_PLACES,
    type TelegramBotCheck,
    type TelegramBotCheckStatus,
    type TelegramBotKey,
    type TelegramBotPlace,
} from '../services/vendor-telegram-bots.service';

/** Один Telegram-бот April: какой бот стоит в токене и нет ли путаницы. */
export class VendorTelegramBotDto implements TelegramBotCheck {
    @ApiProperty({
        description:
            'Имя настройки или переменной окружения с токеном бота (сам токен не отдаётся).',
        enum: TELEGRAM_BOT_KEYS,
        example: 'CABINET_TELEGRAM_BOT_TOKEN',
    })
    key: TelegramBotKey;

    @ApiProperty({
        description: 'Для чего бот — по-русски.',
        type: String,
        example: 'Клиентский (отчёты и уведомления клиентам)',
    })
    title: string;

    @ApiProperty({
        description:
            'Где задаётся токен: admin — в этих настройках, env — только в окружении сервера.',
        enum: TELEGRAM_BOT_PLACES,
        example: 'admin',
    })
    place: TelegramBotPlace;

    @ApiProperty({
        description:
            'Итог проверки: ok — Telegram узнал бота, not-set — токена нет, error — проверка не прошла.',
        enum: TELEGRAM_BOT_CHECK_STATUSES,
        example: 'ok',
    })
    status: TelegramBotCheckStatus;

    @ApiProperty({
        description: 'Имя бота без @ по ответу Telegram.',
        type: String,
        nullable: true,
        example: 'AprilReportBot',
    })
    username: string | null;

    @ApiProperty({
        description: 'Почему проверка не прошла — по-русски.',
        type: String,
        nullable: true,
        example: 'Telegram не узнал токен — неверный или отозван',
    })
    error: string | null;

    @ApiProperty({
        description:
            'Другие боты с тем же токеном — значит, токен вставлен не туда.',
        type: [String],
        example: [],
    })
    sameTokenAs: string[];

    constructor(check: TelegramBotCheck) {
        this.key = check.key;
        this.title = check.title;
        this.place = check.place;
        this.status = check.status;
        this.username = check.username;
        this.error = check.error;
        this.sameTokenAs = check.sameTokenAs;
    }
}

export class VendorTelegramBotsResponseDto {
    @ApiProperty({
        description: 'Все Telegram-боты April в порядке показа.',
        type: [VendorTelegramBotDto],
    })
    bots: VendorTelegramBotDto[];

    constructor(checks: TelegramBotCheck[]) {
        this.bots = checks.map(check => new VendorTelegramBotDto(check));
    }
}
