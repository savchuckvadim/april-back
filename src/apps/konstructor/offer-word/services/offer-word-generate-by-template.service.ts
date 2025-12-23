import { WordTemplate, WordTemplateService } from "@/modules/offer-template/word";
import { OfferWordByTemplateGenerateDto } from "../dto/offer-word-generate-request.dto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { InfoblockService } from "@/modules/garant/infoblock/infoblock.service";
import { ProviderService } from "@/modules/portal-konstructor/provider";
import { StorageService, StorageType } from "@/core/storage";
import Docxtemplater from 'docxtemplater';
import PizZip from "pizzip";
import { FileLinkService } from "@/core/file-link/file-link.service";
import dayjs from "dayjs";
import { randomUUID } from "crypto";

@Injectable()
export class OfferWordGenerateByTemplateService {
    constructor(
        private readonly wordTemplateService: WordTemplateService,
        private readonly infoblockService: InfoblockService,
        private readonly providerService: ProviderService,
        private readonly storageService: StorageService,
        private readonly fileLinkService: FileLinkService

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
        const link = await this.generateByTemplate(template, dto.domain, dto.userId.toString());
        return { template, infoblocks, regions, provider, link };
    }

    private async generateByTemplate(template: WordTemplate, domain: string, userId: string) {
        const currentYear = dayjs().format('YYYY');
        const basePath = `offer-word`;
        const resultPath = `konstructor/${basePath}/${currentYear}/${domain}/${userId}`;
        const uuid = randomUUID();
        const resultFileName = `offer-${uuid}.docx`;


        const isFileExist = await this.storageService.fileExists(template.file_path);



        console.log(isFileExist);
        if (!isFileExist) {
            throw new NotFoundException(
                `File ${template.file_path} not found`,
            );
        }
        const fileBuffer = await this.storageService.readFile(template.file_path);
        const doc = new Docxtemplater(new PizZip(fileBuffer));

        const buf = doc.toBuffer();
        await this.storageService.saveFile(
            buf,
            resultFileName,
            StorageType.PUBLIC,
            resultPath,
        );
        const rootLink = await this.fileLinkService.createPublicLink(
            domain,
            Number(userId),
            'konstructor',
            'offer-word',
            dayjs().format('YYYY'),
            resultFileName,
        );
        return rootLink;
    }

    private async getTemplateDocument(template: WordTemplate) {
        const fileBuffer = await this.storageService.readFile(template.file_path);

        const doc = new Docxtemplater(new PizZip(fileBuffer));

    }
}
