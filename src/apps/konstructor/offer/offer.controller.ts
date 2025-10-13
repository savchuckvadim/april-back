import { Controller, Post, Body } from '@nestjs/common';
import { OfferPdfService } from './offer.pdf.service';
import { ApiTags } from '@nestjs/swagger';
import { OfferDto } from './offer.dto';

@ApiTags('Konstructor')
@Controller('offer')
export class OfferController {
    constructor(private readonly offerService: OfferPdfService) {}

    @Post('create')
    async createOffer(@Body() dto: OfferDto) {
        return await this.offerService.createOffer(dto);
    }
}
