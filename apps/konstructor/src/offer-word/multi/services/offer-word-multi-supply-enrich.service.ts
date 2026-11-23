import { Injectable } from '@nestjs/common';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import {
    SupplyEnrichMemo,
    SupplyPayloadEnricherService,
} from '@app/konstructor/document-generate/supply/supply-payload-enricher.service';
import { OfferWordMultiGenerateDto } from '../dto/offer-word-multi-generate.dto';

/**
 * Подписи поставок в запросе КП v2. Верх запроса печатается, когда участник
 * один или их нет, а каждый вариант печатается сам: у обоих подписи нужны
 * в тех же местах, поэтому дополняются supply, rows, total и sets и там, и
 * там. Одна память на запрос держит число обращений к справочнику равным
 * числу разных поставок.
 */
@Injectable()
export class OfferWordMultiSupplyEnrichService {
    constructor(
        private readonly supplyEnricher: SupplyPayloadEnricherService,
    ) {}

    async enrich(
        dto: OfferWordMultiGenerateDto,
    ): Promise<OfferWordMultiGenerateDto> {
        const memo: SupplyEnrichMemo = new Map();
        const top = await this.supplyEnricher.enrichPayload(dto, memo);
        if (!dto.variants) return top;

        const variants: DocumentVariantDto[] = [];
        for (const variant of dto.variants) {
            variants.push(
                await this.supplyEnricher.enrichPayload(variant, memo),
            );
        }
        return { ...top, variants };
    }
}
