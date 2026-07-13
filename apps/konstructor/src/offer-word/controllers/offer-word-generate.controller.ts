import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordByTemplateGenerateResponseDto } from '../dto/offer-word-generate-response.dto';
import { OfferGenerateQueueService } from '../services/queue/offer-generate-queue.service';

@ApiTags('Konstructor')
@Controller('offer-word-document')
export class OfferWordGenerateController {
    constructor(private readonly queueService: OfferGenerateQueueService) {}

    @ApiOperation({
        summary: 'Generate offer word by template',
        description: 'Generate offer word by template',
    })
    @ApiResponse({
        status: 200,
        description: 'Offer word generated successfully',
        type: OfferWordByTemplateGenerateResponseDto,
    })
    @Post('generate')
    async generateOfferWord(
        @Body() dto: OfferWordByTemplateGenerateDto,
    ): Promise<any> {
        return await this.queueService.start(dto);
    }
}
