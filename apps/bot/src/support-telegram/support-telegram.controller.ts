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
import { SupportTelegramBotService } from '@lib/support';
import {
    SupportTelegramAckDto,
    SupportTelegramUpdateDto,
} from './dto/support-telegram-update.dto';
import {
    SupportTelegramWebhookGuard,
    TELEGRAM_SECRET_HEADER,
} from './guards/support-telegram-webhook.guard';

/**
 * Вебхук Telegram-бота поддержки: команды ИИ-помощнику («что в поддержке»,
 * «разбери …») и кнопки под черновиком. Закрыт секретом вебхука.
 */
@ApiTags('Support Telegram')
@ApiHeader({
    name: TELEGRAM_SECRET_HEADER,
    description: 'Секрет вебхука (env SUPPORT_TELEGRAM_WEBHOOK_SECRET).',
    required: true,
})
@BackgroundCalls()
@UseGuards(SupportTelegramWebhookGuard)
@Controller('support/telegram')
export class SupportTelegramController {
    private readonly logger = new Logger(SupportTelegramController.name);

    constructor(private readonly bot: SupportTelegramBotService) {}

    @Post('webhook')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Вебхук Telegram-бота поддержки',
        description:
            'Принимает обновления Telegram (сообщения и нажатия кнопок) и ' +
            'обрабатывает их в фоне: Telegram ждёт быстрый ответ, а разбор ' +
            'диалога моделью занимает десятки секунд. Ответ клиенту уходит ' +
            'только по кнопке «Отправить клиенту».',
    })
    @ApiBody({
        type: SupportTelegramUpdateDto,
        description: 'Обновление Telegram.',
    })
    @ApiOkResponse({
        type: SupportTelegramAckDto,
        description: 'Принято в обработку.',
    })
    webhook(@Body() body: SupportTelegramUpdateDto): SupportTelegramAckDto {
        void this.bot.handle(body).catch((error: unknown) => {
            this.logger.error(
                `Обновление Telegram ${body.update_id} не обработано: ${(error as Error).message}`,
            );
        });
        return { accepted: true };
    }
}
