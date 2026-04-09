import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { OfferWordByTemplateGenerateUseCase } from '../use-cases/offer-word-by-template-generate.use-case';
import { OfferWordByTemplateGenerateResponseDto } from '../dto/offer-word-generate-response.dto';

@ApiTags('Konstructor')
@Controller('offer-word-document')
export class OfferWordGenerateController {
    constructor(
        private readonly offerWordByTemplateGenerate: OfferWordByTemplateGenerateUseCase,
    ) {}

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
        return dto.withoutQueue
            ? await this.offerWordByTemplateGenerate.execute(dto)
            : await this.offerWordByTemplateGenerate.execute(dto);
    }
}
