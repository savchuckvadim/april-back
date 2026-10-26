import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BackgroundCalls } from '@lib/core/call-context';
import { SupportMonitorSettingsService } from '../application/support-monitor-settings.service';
import { SupportMonitorTickService } from '../application/support-monitor-tick.service';
import { normalizeSupportDomain } from '../application/support-monitor-options';
import {
    SupportMonitorPreviewRequestDto,
    SupportMonitorPreviewResponseDto,
} from './dto/support-monitor-preview.dto';

/**
 * Предпросмотр монитора линии поддержки для админки: открытые диалоги и
 * оповещения, которые крон отправил бы сейчас. Только чтение — включать
 * оповещения на живой линии вслепую нельзя.
 */
@ApiTags('Admin Support monitor')
@BackgroundCalls()
@Controller('admin/support-monitor')
export class SupportMonitorAdminController {
    constructor(
        private readonly settings: SupportMonitorSettingsService,
        private readonly tick: SupportMonitorTickService,
    ) {}

    @Post('preview')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Что монитор поддержки отправил бы сейчас',
        description:
            'Читает открытые диалоги линии портала по его настройкам ' +
            '(«Портал (общие)» → «Поддержка») и показывает, кто ждёт ответа ' +
            'и какие оповещения ушли бы сейчас. Ничего не отправляет и не ' +
            'запоминает: память крона не меняется.',
    })
    @ApiBody({
        type: SupportMonitorPreviewRequestDto,
        description: 'Портал, где живёт открытая линия.',
    })
    @ApiOkResponse({
        type: SupportMonitorPreviewResponseDto,
        description: 'Открытые диалоги и оповещения, которые ушли бы сейчас.',
    })
    async preview(
        @Body() body: SupportMonitorPreviewRequestDto,
    ): Promise<SupportMonitorPreviewResponseDto> {
        const domain = normalizeSupportDomain(body.domain);
        const options = await this.settings.resolveOptions(domain);
        return this.tick.preview(domain, options);
    }
}
