import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    OfferWordMultiGenerateDto,
    OfferWordMultiGenerateResponseDto,
} from '../dto/offer-word-multi-generate.dto';
import { OfferGenerateMultiQueueService } from '../services/queue/offer-generate-multi-queue.service';

@ApiTags('Konstructor')
@Controller('offer-word-document')
export class OfferWordMultiGenerateController {
    constructor(
        private readonly queueService: OfferGenerateMultiQueueService,
    ) {}

    @Post('generate-multi')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сгенерировать КП по шаблону (v2, несколько участников)',
        description:
            'Генерация КП и счетов для нескольких вариантов комплекта. Режим печати берётся из настроек сборки: compare — открытый вариант (остальные «для сравнения»), merged — один документ с объединённым наполнением, independent — рендер на участника со склейкой PDF или отдельными документами. Счета выставляются по группам с одним типом договора. Старая ручка generate не меняется.',
    })
    @ApiBody({
        type: OfferWordMultiGenerateDto,
        description:
            'Payload старой ручки generate плюс участники (variants) и настройки сборки (composition).',
    })
    @ApiOkResponse({
        type: OfferWordMultiGenerateResponseDto,
        description:
            'operationId джобы в очереди либо, при withoutQueue, готовые ссылки на документы.',
    })
    async generateOfferWordMulti(
        @Body() dto: OfferWordMultiGenerateDto,
    ): Promise<OfferWordMultiGenerateResponseDto> {
        return await this.queueService.start(dto);
    }
}
