import { Injectable, Logger } from '@nestjs/common';
import { OfferDto } from './offer.dto';
import { FileLinkService } from 'src/core/file-link/file-link.service';
import { ConfigService } from '@nestjs/config';
import { StorageService, StorageType } from 'src/core/storage/storage.service';
import fs from 'fs';
import PizZip from 'pizzip';
// import Docxtemplater from 'docxtemplater';
import Docxtemplater from 'docxtemplater';

import { DocumentInfoblockService } from '../document-generate/infoblocks/infoblock.service';
import dayjs from 'dayjs';
import { PriceDto } from '../document-generate';

interface PriceTableRenderData {
    data: string[][];
    size: number[];
    widths: number[];
    height: number;
    header: string[];
    style: {
        header: {
            shade: string;
            textAlign: string;
        };
        normal: {
            shade: string;
            textAlign: string;
        };
    };
}
export interface OfferTemplateRenderData {
    infoblocksLeft: string[];
    infoblocksRight: string[];
    table: PriceTableRenderData;
}

//TODO: Не может быть injectable так как в конструкторе хардкодится один шаблон
@Injectable()
export class OfferService {
    private doc: Docxtemplater<PizZip>;
    private documentType: 'offer' = 'offer';
    private currentYear: string;
    private resultPath: string;
    private documentName: string;
    private baseUrl: string;
    private readonly logger = new Logger(OfferService.name);
    constructor(
        private readonly storage: StorageService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
        private readonly documentInfoblockService: DocumentInfoblockService,
    ) {
        this.currentYear = dayjs().format('YYYY');
        this.baseUrl = this.configService.get('APP_URL') as string;
        try {
            this.getDocTemplater();
        } catch (error) {
            this.logger.error('Error initializing OfferService:', error);
        }

    }
    private getDocTemplater() {
        try {
            const templatePath = this.storage.getFilePath(
                StorageType.APP,
                'konstructor/templates/offer',
                'template.docx',
            );
            const content = fs.readFileSync(templatePath, 'binary');

            const zip = new PizZip(content);
            this.doc = new Docxtemplater(
                zip,

                {
                    paragraphLoop: true,
                    linebreaks: true,
                },
            );
        } catch (error) {
            this.logger.error('Error getting DocTemplater getDocTemplater:', error);
        }

    }
    async createOffer(
        dto: OfferDto,
    ): Promise<{ link: string; data: OfferTemplateRenderData }> {
        this.resultPath = `konstructor/${this.documentType}/${this.currentYear}/${dto.domain}/${dto.userId}`;
        const totalName = dto.price.cells.total?.[0]?.name || 'Гарант';
        this.documentName = `${totalName}.docx`;
        const offerData = await this.getOfferTemplateData(dto);
        await this.renderDocument(offerData);
        await this.saveDocument();
        const link = await this.createLink(dto.domain, dto.userId);
        return { link, data: offerData };
    }

    async getOfferTemplateData(
        dto: OfferDto,
    ): Promise<OfferTemplateRenderData> {
        const { infoblocksLeft, infoblocksRight } =
            this.documentInfoblockService.getInfoblocks(
                dto.complect,
                dto.regions,
            );
        const table = await this.getPriceTableData(dto.price);
        return {
            infoblocksLeft,
            infoblocksRight,
            table,
        };
    }
    async getPriceTableData(dto: PriceDto): Promise<PriceTableRenderData> {
        const prices = [
            [
                '1',
                'John',
                'Foobar',
                '3374 Olen Thomas Drive Frisco Texas 75034',
            ],
            [
                '2',
                'Mary',
                'Foobaz',
                '352 Illinois Avenue Yamhill Oregon(OR) 97148',
            ],
        ];
        const renderData = {
            data: prices,
            size: [2, 4], // means 2 lines, 4 columns
            widths: [175, 175, 175, 175], // The widths of each column
            height: 200, // The height of each column
            header: ['Index', 'Name', 'Title', 'Description'],
            style: {
                header: {
                    shade: 'DDDD33',
                    textAlign: 'left',
                },
                normal: {
                    shade: 'E0E0E0',
                    textAlign: 'right',
                },
            },
        };
        return renderData;
    }

    private async renderDocument(data: OfferTemplateRenderData) {
        this.doc.render(data);
    }
    private async saveDocument() {
        const buf = this.doc.toBuffer();
        await this.storage.saveFile(
            buf,
            this.documentName,
            StorageType.PUBLIC,
            this.resultPath,
        );
        // const pdf = await this.libreOfficeService.convertToPdf(this.storage.getFilePath(StorageType.PUBLIC, this.resultPath, this.documentName));
    }

    private async createLink(domain: string, userId: number) {
        const rootLink = await this.fileLinkService.createPublicLink(
            domain,
            userId,
            'konstructor',
            this.documentType,
            this.currentYear,
            `${this.documentName}`,
        );
        const link = `${this.baseUrl}${rootLink}`;
        return link;
    }
}
