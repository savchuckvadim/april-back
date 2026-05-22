import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
    PollDomainDto,
    StartBridgeDto,
    TelegramWebhookUpdateDto,
} from '../dto/bitrix-im-bridge.dto';
import { StartBridgeUseCase } from '../usecases/start-bridge.use-case';
import { PollDomainUseCase } from '../usecases/poll-domain.use-case';
import { HandleTelegramWebhookUseCase } from '../usecases/handle-telegram-webhook.use-case';
import { TelegramBridgeService } from '../services/telegram-bridge.service';

@ApiTags('Bitrix IM Bridge')
@Controller('commands/bitrix-im-bridge')
export class BitrixImBridgeController {
    constructor(
        private readonly startBridgeUseCase: StartBridgeUseCase,
        private readonly pollDomainUseCase: PollDomainUseCase,
        private readonly handleTelegramWebhookUseCase: HandleTelegramWebhookUseCase,
        private readonly telegramBridge: TelegramBridgeService,
    ) {}

    @ApiOperation({
        summary:
            'Подписать домен и запустить мост Bitrix IM → Telegram по расписанию',
    })
    @ApiBody({ type: StartBridgeDto })
    @Post('start')
    async start(@Body() dto: StartBridgeDto) {
        return await this.startBridgeUseCase.execute(dto);
    }

    @ApiOperation({ summary: 'Немедленный поллинг одного домена Bitrix' })
    @ApiBody({ type: PollDomainDto })
    @Post('poll')
    async poll(@Body() dto: PollDomainDto) {
        return await this.pollDomainUseCase.execute(dto.domain);
    }

    @ApiOperation({
        summary: 'Вебхук Telegram — получение ответов оператора',
    })
    @ApiBody({ type: TelegramWebhookUpdateDto })
    @Post('telegram/webhook')
    async telegramWebhook(@Body() body: TelegramWebhookUpdateDto) {
        return await this.handleTelegramWebhookUseCase.execute(body);
    }

    @ApiOperation({
        summary: 'Диагностика: статус Telegram-вебхука bridge-бота',
    })
    @Get('telegram/webhook-info')
    async telegramWebhookInfo() {
        return this.telegramBridge.getWebhookInfo();
    }

    @ApiOperation({
        summary: 'Зарегистрировать вебхук Telegram bridge-бота',
    })
    @ApiQuery({ name: 'url', description: 'Полный URL вебхука', required: true })
    @Post('telegram/webhook-register')
    async telegramWebhookRegister(@Query('url') url: string) {
        await this.telegramBridge.registerWebhook(url);
        return { ok: true, url };
    }
}
