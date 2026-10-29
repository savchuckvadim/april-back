import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    AI_PROVIDERS_ADMIN_PATH,
    AI_PROVIDERS_ADMIN_TAG,
} from '../ai-providers.const';
import { PortalAiProvidersReadinessDto } from '../dto/ai-providers-readiness.dto';
import { PortalAiProvidersReadinessService } from '../services/ai-providers-readiness.service';

/**
 * Чек-лист готовности провайдеров AI портала для формы «Поставщики AI»
 * в админке: что настроено, чей ключ, пойдёт ли через прокси, отвечает ли.
 * Ничего не меняет — только читает настройки портала, ключи и env.
 */
@ApiTags(AI_PROVIDERS_ADMIN_TAG)
@Controller(AI_PROVIDERS_ADMIN_PATH)
export class PortalAiProvidersController {
    constructor(
        private readonly readinessService: PortalAiProvidersReadinessService,
    ) {}

    @Get('readiness')
    @ApiOperation({
        summary: 'Готовность провайдеров AI портала',
        description:
            'Провайдеры LLM в действующем порядке и три транскрибатора: ' +
            'настроен ли каждый, чей ключ (портала или приложения), хост ' +
            "endpoint'а и пойдёт ли вызов через исходящий прокси. " +
            'С probe=true дополнительно делает GET /models у ' +
            'OpenAI-совместимого LLM и Whisper-сервиса — показывает «не ' +
            'отвечает» и «ключ не принят».',
    })
    @ApiParam({ name: 'portalId', type: Number, example: 5 })
    @ApiQuery({
        name: 'probe',
        required: false,
        type: Boolean,
        description:
            "Проверить связь с настроенными endpoint'ами (дольше на несколько секунд).",
        example: true,
    })
    @ApiOkResponse({
        type: PortalAiProvidersReadinessDto,
        description: 'Чек-лист провайдеров портала.',
    })
    async readiness(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query('probe') probe?: string,
    ): Promise<PortalAiProvidersReadinessDto> {
        const withProbe = probe === 'true' || probe === '1';
        return new PortalAiProvidersReadinessDto(
            await this.readinessService.build(portalId, withProbe),
        );
    }
}
