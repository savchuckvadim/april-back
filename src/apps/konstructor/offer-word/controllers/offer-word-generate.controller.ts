import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OfferWordByTemplateGenerateDto } from "../dto/offer-word-generate-request.dto";
import { OfferWordGenerateByTemplateService } from "../services/offer-word-generate-by-template.service";

@ApiTags('Konstructor')
@Controller('offer-word-document')
export class OfferWordGenerateController {
    constructor(private readonly offerWordGenerateService: OfferWordGenerateByTemplateService) {}

    @Post('generate')
    async generateOfferWord(@Body() dto: OfferWordByTemplateGenerateDto) {
        return this.offerWordGenerateService.generateOfferWord(dto);
    }
}
