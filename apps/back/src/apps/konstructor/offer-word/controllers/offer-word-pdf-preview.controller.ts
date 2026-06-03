import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordEphemeralPdfQueueService } from '../services/queue/offer-word-ephemeral-pdf-queue.service';
import {
    OfferWordEphemeralPdfPollResponseDto,
    OfferWordEphemeralPdfStartResponseDto,
    OfferWordEphemeralPdfStopResponseDto,
} from '../dto/offer-word-ephemeral-pdf.dto';

@ApiTags('Konstructor')
@Controller('offer-word-pdf-preview')
export class OfferWordPdfPreviewController {
    constructor(
        private readonly offerWordEphemeralPdfQueueService: OfferWordEphemeralPdfQueueService,
    ) {}

    @ApiOperation({
        summary: 'Превью: запуск генерации PDF в очередь',
        description:
            'Всегда PDF (isWord в теле игнорируется). Возвращает operationId для polling и отмены.',
    })
    @ApiResponse({
        status: 200,
        description: 'Операция поставлена в очередь',
        type: OfferWordEphemeralPdfStartResponseDto,
    })
    @Post()
    async startPreview(
        @Body() dto: OfferWordByTemplateGenerateDto,
    ): Promise<OfferWordEphemeralPdfStartResponseDto> {
        const operationId =
            await this.offerWordEphemeralPdfQueueService.start(dto);
        return new OfferWordEphemeralPdfStartResponseDto(operationId);
    }

    @ApiOperation({
        summary: 'Превью: статус операции',
        description:
            'pending — в очереди или в работе; ready — pdfBase64 (до TTL в Redis); failed — ошибка или истёк TTL',
    })
    @ApiParam({ name: 'operationId', type: String })
    @ApiResponse({
        status: 200,
        type: OfferWordEphemeralPdfPollResponseDto,
    })
    @Get(':operationId')
    async getPreviewStatus(
        @Param('operationId') operationId: string,
    ): Promise<OfferWordEphemeralPdfPollResponseDto> {
        return this.offerWordEphemeralPdfQueueService.poll(operationId);
    }

    @ApiOperation({
        summary: 'Превью: отменить операцию по operationId',
        description:
            'Ставит флаг отмены в Redis, удаляет готовый результат (если был), снимает задачу с очереди или помечает активную как failed.',
    })
    @ApiParam({ name: 'operationId', type: String })
    @ApiResponse({
        status: 200,
        type: OfferWordEphemeralPdfStopResponseDto,
    })
    @Delete(':operationId')
    async stopPreview(
        @Param('operationId') operationId: string,
    ): Promise<OfferWordEphemeralPdfStopResponseDto> {
        return this.offerWordEphemeralPdfQueueService.stop(operationId);
    }
}
