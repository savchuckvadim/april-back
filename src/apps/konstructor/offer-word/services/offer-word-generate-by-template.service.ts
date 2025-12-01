import { WordTemplateService } from "@/modules/offer-template/word";
import { OfferWordByTemplateGenerateDto } from "../dto/offer-word-generate-request.dto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InfoblockService } from "@/modules/garant/infoblock/infoblock.service";
import { ProviderService } from "@/modules/portal-konstructor/provider";


@Injectable()
export class OfferWordGenerateByTemplateService {
    constructor(
        private readonly wordTemplateService: WordTemplateService,
        private readonly infoblockService: InfoblockService,
        private readonly providerService: ProviderService

    ) { }

    async generateOfferWord(dto: OfferWordByTemplateGenerateDto) {
        const template = await this.wordTemplateService.findById(BigInt(dto.templateId));
        if (!template) {
            throw new NotFoundException(
                `Word template with ID ${dto.templateId} not found`,
            );
        }
        const complectCodes = dto.complect.map(group => group.value.map(value => value.code));


        const infoblocks = await this.infoblockService.getInfoblocksByCodse(
            complectCodes
                .flat()
                .filter((code): code is string => code !== undefined && code !== 'reg')

        );

        const regions = [...dto.regions.inComplect, ...dto.regions.favorite, ...dto.regions.noWidth];
        const provider = await this.providerService.findById(Number(dto.providerId));

        return { template, infoblocks, regions, provider };
    }
}
