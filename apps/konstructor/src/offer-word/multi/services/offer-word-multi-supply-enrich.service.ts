import { Injectable } from '@nestjs/common';
import { SupplyPayloadEnricherService } from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { OfferWordMultiGenerateDto } from '../dto/offer-word-multi-generate.dto';

/**
 * Подписи поставок в запросе КП v2. Верх запроса печатается, когда участник
 * один или их нет, а каждый вариант печатается сам: у обоих подписи нужны
 * в тех же местах, поэтому дополняются supply, rows, total и sets и там, и
 * там. Одна память на запрос держит число обращений к справочнику равным
 * числу разных поставок. Общая логика — в SupplyPayloadEnricherService
 * (enrichWithVariants): её же использует PDF-КП.
 */
@Injectable()
export class OfferWordMultiSupplyEnrichService {
    constructor(
        private readonly supplyEnricher: SupplyPayloadEnricherService,
    ) {}

    enrich(dto: OfferWordMultiGenerateDto): Promise<OfferWordMultiGenerateDto> {
        return this.supplyEnricher.enrichWithVariants(dto);
    }
}
