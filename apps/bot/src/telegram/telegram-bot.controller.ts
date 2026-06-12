import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelegramBotService } from './telegram-bot.service';
import {
    TelegramAckResponseDto,
    TelegramUpdateDto,
} from './dto/telegram-update.dto';

/**
 * Контроллер вебхуков Telegram-бота (шаблон).
 */
@ApiTags('Bot — Telegram канал')
@Controller('bot/telegram')
export class TelegramBotController {
    constructor(private readonly telegramBotService: TelegramBotService) {}

    @Post('update')
    @ApiOperation({
        summary: 'Приём update Telegram-бота',
        description:
            'Принимает update от Telegram (webhook) и ставит его в обработку сценарием бота.',
    })
    @ApiOkResponse({ type: TelegramAckResponseDto })
    handleUpdate(@Body() body: TelegramUpdateDto): TelegramAckResponseDto {
        this.telegramBotService.handleUpdate(body);

        return { accepted: true, channel: 'telegram' };
    }
}
