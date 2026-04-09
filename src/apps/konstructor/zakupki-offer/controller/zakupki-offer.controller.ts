import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZakupkiOfferCreateDto } from '../dto/zakupki-offer.dto';
import { ZakupkiOfferQueueService } from '../services/zukupki-offer.queue-service';

@ApiTags('Konstructor')
@Controller('zakupki-offer')
export class ZakupkiOfferController {
    constructor(
        private readonly zakupkiOfferQueueService: ZakupkiOfferQueueService,
    ) {}

    @Post('create')
    async createZakupkiOffer(@Body() dto: ZakupkiOfferCreateDto) {
        return await this.zakupkiOfferQueueService.start(dto);
    }
}
