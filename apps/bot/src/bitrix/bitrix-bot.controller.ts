import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BitrixBotService } from './bitrix-bot.service';
import {
    BitrixBotEventDto,
    BotAckResponseDto,
} from './dto/bitrix-bot-event.dto';

/**
 * Контроллер вебхуков Bitrix-бота (шаблон).
 */
@ApiTags('Bot — Bitrix канал')
@Controller('bot/bitrix')
export class BitrixBotController {
    constructor(private readonly bitrixBotService: BitrixBotService) {}

    @Post('event')
    @ApiOperation({
        summary: 'Приём события Bitrix-бота',
        description:
            'Принимает событие imbot от портала Bitrix и ставит его в обработку сценарием бота.',
    })
    @ApiOkResponse({ type: BotAckResponseDto })
    handleEvent(@Body() body: BitrixBotEventDto): BotAckResponseDto {
        this.bitrixBotService.handleEvent(body);

        return { accepted: true, channel: 'bitrix' };
    }
}
