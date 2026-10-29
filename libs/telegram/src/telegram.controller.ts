import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelegramSendMessageDto } from './telegram.dto';
import { TelegramService } from './telegram.service';

/**
 * Публичная ручка тревог для фронтов и соседних приложений: сообщение уходит
 * в чат администратора через единственный TelegramService (Bot API через
 * исходящий прокси). `/telegram/original` — старый адрес второго сервиса,
 * оставлен как псевдоним, чтобы не менять фронты.
 */
@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
    constructor(private readonly telegramService: TelegramService) {}

    @ApiOperation({
        summary: 'Отправить тревогу в Telegram',
        description:
            'Текст с маркером приложения, доменом и пользователем уходит в чат администратора. Ошибка Telegram не возвращается наружу: тревога — не бизнес-операция.',
    })
    @ApiBody({ type: TelegramSendMessageDto })
    @ApiOkResponse({
        type: String,
        description: 'Текст сообщения после подготовки к Markdown.',
    })
    @Post()
    async getTelegram(@Body() dto: TelegramSendMessageDto): Promise<string> {
        return await this.telegramService.sendPublicMessage(dto);
    }

    @ApiOperation({
        summary: 'Отправить тревогу в Telegram (старый адрес)',
        description:
            'Псевдоним основной ручки: раньше здесь был отдельный сервис прямой отправки, теперь отправитель один.',
    })
    @ApiBody({ type: TelegramSendMessageDto })
    @ApiOkResponse({
        type: String,
        description: 'Текст сообщения после подготовки к Markdown.',
    })
    @Post('original')
    async getTelegramOriginal(
        @Body() dto: TelegramSendMessageDto,
    ): Promise<string> {
        return await this.telegramService.sendPublicMessage(dto);
    }
}
