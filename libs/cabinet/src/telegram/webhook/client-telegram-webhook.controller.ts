import {
    Body,
    Controller,
    HttpCode,
    Logger,
    Post,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBody,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { BackgroundCalls } from '@lib/core/call-context';
import { TELEGRAM_SECRET_HEADER } from '@lib/telegram';
import { ClientTelegramUpdateHandler } from '../client-telegram-update.handler';
import { ClientTelegramWebhookGuard } from './client-telegram-webhook.guard';
import {
    ClientTelegramAckDto,
    ClientTelegramUpdateDto,
} from './client-telegram-update.dto';

/**
 * Вебхук клиентского Telegram-бота April (привязка чатов к порталам).
 * Закрыт секретом вебхука; обработка — в фоне (Telegram ждёт быстрый ответ).
 */
@ApiTags('Кабинет клиента: Telegram-бот')
@ApiHeader({
    name: TELEGRAM_SECRET_HEADER,
    description:
        'Секрет вебхука: приложение вычисляет его из токена бота и передаёт Telegram при регистрации.',
    required: true,
})
@BackgroundCalls()
@UseGuards(ClientTelegramWebhookGuard)
@Controller('cabinet/telegram')
export class ClientTelegramWebhookController {
    private readonly logger = new Logger(ClientTelegramWebhookController.name);

    constructor(private readonly handler: ClientTelegramUpdateHandler) {}

    @Post('webhook')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Вебхук клиентского Telegram-бота',
        description:
            'Принимает сообщения боту: /start КОД — привязать чат к сотруднику портала, /stop — отвязать.',
    })
    @ApiBody({
        type: ClientTelegramUpdateDto,
        description: 'Обновление Telegram.',
    })
    @ApiOkResponse({ type: ClientTelegramAckDto, description: 'Принято.' })
    webhook(@Body() body: ClientTelegramUpdateDto): ClientTelegramAckDto {
        void this.handler.handle(body).catch((error: unknown) => {
            this.logger.error(
                `Обновление Telegram ${body.update_id} не обработано: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        });
        return { accepted: true };
    }
}
