import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZakupkiOfferCreateDto } from '../dto/zakupki-offer.dto';
import { ZakupkiOfferQueueService } from '../services/zukupki-offer.queue-service';

@ApiTags('Konstructor')
@Controller('zakupki-offer')
export class ZakupkiOfferController {
    constructor(
        private readonly zakupkiOfferQueueService: ZakupkiOfferQueueService,
    ) {}

    @Post('create')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сформировать «3 КП для торгов»',
        description:
            'Ставит генерацию в очередь ZAKUPKI_OFFER; результат уходит в ' +
            'Битрикс (ссылка в таймлайн). Ручки статуса нет.',
    })
    @ApiBody({ type: ZakupkiOfferCreateDto })
    @ApiOkResponse({
        type: String,
        description: 'operationId джобы в очереди.',
    })
    async createZakupkiOffer(
        @Body() dto: ZakupkiOfferCreateDto,
    ): Promise<string> {
        return await this.zakupkiOfferQueueService.start(dto);
    }
}
