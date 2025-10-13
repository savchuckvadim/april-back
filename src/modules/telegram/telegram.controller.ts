import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelegramSendMessageDto } from './telegram.dto';
import { TelegramService } from './telegram.service';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
    constructor(private readonly telegramService: TelegramService) {}

    @ApiOperation({ summary: 'Send message to telegram' })
    @ApiBody({ type: TelegramSendMessageDto })
    @Post()
    async getTelegram(@Body() dto: TelegramSendMessageDto) {
        return await this.telegramService.sendPublicMessage(dto);
    }
}
