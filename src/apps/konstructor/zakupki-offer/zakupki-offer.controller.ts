import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZakupkiOfferCreateService } from './zakupki-offer.service';
import { ZakupkiOfferCreateDto } from './dto/zakupki-offer.dto';

@ApiTags('Konstructor')
@Controller('zakupki-offer')
export class ZakupkiOfferController {
    constructor(
        private readonly zakupkiOfferService: ZakupkiOfferCreateService,
    ) {}

    @Post('create')
    async createZakupkiOffer(@Body() dto: ZakupkiOfferCreateDto) {
        return this.zakupkiOfferService.createZakupkiOffer(dto);
    }
}
