import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordByTemplateGenerateResponseDto } from '../dto/offer-word-generate-response.dto';
import {
    OfferGenerateQueueService,
    type OfferWordGenerateStartResult,
} from '../services/queue/offer-generate-queue.service';

@ApiTags('Konstructor')
@Controller('offer-word-document')
export class OfferWordGenerateController {
    constructor(private readonly queueService: OfferGenerateQueueService) {}

    /**
     * Легаси-ручка старого фронта: ответ — либо operationId (строка), либо
     * при `withoutQueue` сырой результат генерации. Новый фронт ходит в
     * `generate-multi` (типизированный ответ, варианты КП), сюда — нет.
     */
    @ApiOperation({
        summary: 'Generate offer word by template (легаси)',
        description:
            'Ответ: operationId джобы (строка) либо при withoutQueue — результат ' +
            'генерации. Новый фронт использует generate-multi.',
        deprecated: true,
    })
    @ApiResponse({
        status: 200,
        description: 'Offer word generated successfully',
        type: OfferWordByTemplateGenerateResponseDto,
    })
    @Post('generate')
    async generateOfferWord(
        @Body() dto: OfferWordByTemplateGenerateDto,
    ): Promise<OfferWordGenerateStartResult> {
        return await this.queueService.start(dto);
    }
}
