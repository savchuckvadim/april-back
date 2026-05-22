import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TelegramSendMessagePublicDto } from './telegram.dto';
import { TelegramService } from './telegram.service';
import { TelegramOriginalService } from './telegram-original.service';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
    constructor(
        private readonly telegramService: TelegramService,
        private readonly telegramOriginalService: TelegramOriginalService,
    ) {}

    @ApiOperation({ summary: 'Send message to telegram' })
    @ApiBody({ type: TelegramSendMessagePublicDto })
    @Post()
    async getTelegram(@Body() dto: TelegramSendMessagePublicDto) {
        return await this.telegramService.sendPublicMessage(dto);
    }

    @ApiOperation({ summary: 'Send message to telegram' })
    @ApiBody({ type: TelegramSendMessageDto })
    @Post('original')
    async getTelegramOriginal(@Body() dto: TelegramSendMessageDto) {
        return await this.telegramOriginalService.sendPublicMessage(dto);
    }
}
