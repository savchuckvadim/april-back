import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    PollDomainDto,
    StartBridgeDto,
    TelegramWebhookUpdateDto,
} from '../dto/bitrix-im-bridge.dto';
import { StartBridgeUseCase } from '../usecases/start-bridge.use-case';
import { PollDomainUseCase } from '../usecases/poll-domain.use-case';
import { HandleTelegramWebhookUseCase } from '../usecases/handle-telegram-webhook.use-case';

@ApiTags('Bitrix IM Bridge')
@Controller('commands/bitrix-im-bridge')
export class BitrixImBridgeController {
    constructor(
        private readonly startBridgeUseCase: StartBridgeUseCase,
        private readonly pollDomainUseCase: PollDomainUseCase,
        private readonly handleTelegramWebhookUseCase: HandleTelegramWebhookUseCase,
    ) {}

    @ApiOperation({
        summary:
            'Subscribe domain and start scheduled Bitrix IM -> Telegram bridge',
    })
    @ApiBody({ type: StartBridgeDto })
    @Post('start')
    async start(@Body() dto: StartBridgeDto) {
        return await this.startBridgeUseCase.execute(dto);
    }

    @ApiOperation({ summary: 'Poll one Bitrix domain immediately' })
    @ApiBody({ type: PollDomainDto })
    @Post('poll')
    async poll(@Body() dto: PollDomainDto) {
        return await this.pollDomainUseCase.execute(dto.domain);
    }

    @ApiOperation({
        summary: 'Telegram webhook endpoint for reply -> Bitrix relay',
    })
    @ApiBody({ type: TelegramWebhookUpdateDto })
    @Post('telegram/webhook')
    async telegramWebhook(@Body() body: TelegramWebhookUpdateDto) {
        return await this.handleTelegramWebhookUseCase.execute(body);
    }
}
