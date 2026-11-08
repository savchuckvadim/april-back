import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import {
    TELEGRAM_BOT_CHECK_STATUSES,
    TELEGRAM_BOT_KEYS,
    TELEGRAM_BOT_PLACES,
    type TelegramBotCheck,
    type TelegramBotCheckStatus,
    type TelegramBotKey,
    type TelegramBotPlace,
    type TelegramBotWebhook,
} from '../services/vendor-telegram-bots.service';
import type { TelegramBotTestResult } from '../services/vendor-telegram-bot-test.service';

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

    @ApiProperty({
        description:
            'Вебхук по ответу Telegram: доходят ли до нас сообщения боту. null — бот только отправляет (тревоги) или Telegram не ответил.',
        type: () => VendorTelegramBotWebhookDto,
        nullable: true,
    })
    webhook: VendorTelegramBotWebhookDto | null;

    @ApiProperty({
        description:
            'Есть общий чат для тестового сообщения (поддержка — чат поддержки, тревоги — чат админа). У клиентского бота — нет.',
        type: Boolean,
        example: true,
    })
    canTest: boolean;

    constructor(check: TelegramBotCheck) {
        this.key = check.key;
        this.title = check.title;
        this.place = check.place;
        this.status = check.status;
        this.username = check.username;
        this.error = check.error;
        this.sameTokenAs = check.sameTokenAs;
        this.webhook = check.webhook;
        this.canTest = check.canTest;
    }
}

export class VendorTelegramBotWebhookDto implements TelegramBotWebhook {
    @ApiProperty({
        description:
            'Куда Telegram шлёт сообщения боту; null — вебхук не установлен.',
        type: String,
        nullable: true,
        example: 'https://api.bot.april-app.ru/api/cabinet/telegram/webhook',
    })
    url!: string | null;

    @ApiProperty({
        description: 'Сколько сообщений ждут доставки на наш сервер.',
        type: Number,
        example: 0,
    })
    pending!: number;

    @ApiProperty({
        description:
            'Последняя ошибка доставки на наш сервер (текст Telegram).',
        type: String,
        nullable: true,
        example: null,
    })
    lastError!: string | null;

    @ApiProperty({
        description: 'Когда была последняя ошибка (ISO).',
        type: String,
        nullable: true,
        example: null,
    })
    lastErrorAt!: string | null;
}

export class VendorTelegramBotTestDto {
    @ApiPropertyOptional({
        description:
            'Куда отправить (chat id). Не задан — общий чат бота: поддержка — чат поддержки, тревоги — TELEGRAM_ADMIN_CHAT_ID.',
        type: String,
        example: '-1001234567890',
    })
    @IsOptional()
    @Matches(/^-?\d{3,20}$/, {
        message: 'chat id — число, у групп отрицательное',
    })
    chatId?: string;
}

export class VendorTelegramBotTestResultDto implements TelegramBotTestResult {
    @ApiProperty({
        description: 'Сообщение доставлено.',
        type: Boolean,
        example: true,
    })
    ok!: boolean;

    @ApiProperty({
        description: 'Что произошло и что сделать — по-русски.',
        type: String,
        example: 'Сообщение доставлено в чат -1001234567890.',
    })
    message!: string;
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
