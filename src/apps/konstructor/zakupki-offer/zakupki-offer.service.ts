import { Injectable } from "@nestjs/common";
import { ZakupkiOfferCreateDto } from "./dto/zakupki-offer.dto";
// import path from "path";
import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { StorageService, StorageType } from "src/core/storage/";
import { FileLinkService } from "src/core/file-link/file-link.service";
import { ConfigService } from "@nestjs/config";
import { OtherProvidersDto, Provider1FieldCode, Provider2FieldCode, ProviderOtherFieldDto } from "./dto/other-provider.dto";

import dayjs from "dayjs";
import 'dayjs/locale/ru'; // подключаем русскую локаль
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';


import localizedFormat from "dayjs/plugin/localizedFormat";
import {
    RecipientDto,
} from "src/apps/konstructor/document-generate";
// import { rubles } from 'rubles';
import { formatRuble } from "../document-generate/lib/rubles.util";
import { PBXService } from "src/modules/pbx/pbx.servise";
import { BitrixEntityType, BitrixService } from "src/modules/bitrix";

import { ProviderDto } from "../../../modules/portal-konstructor/provider";
import { DocumentInfoblockService } from "../document-generate/";
import { DocumentTotalRowService } from "../document-generate/";
@Injectable()
export class ZakupkiOfferCreateService {
    private readonly baseUrl: string;
    private contractPeriod: string;
   
    private documentName: string = '3 КП';
    private documentNumber: string = '';
    private currentYear: string;
    private resultPath: string;

    constructor(
        private readonly storage: StorageService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
        private readonly pbx: PBXService,
      
        private readonly documentInfoblockService: DocumentInfoblockService,
        private readonly totalRowService: DocumentTotalRowService,

    ) {
        dayjs.extend(localizedFormat);
        dayjs.locale('ru'); // устанавливаем локаль
        dayjs.extend(utc);
        dayjs.extend(timezone);
        dayjs.tz.setDefault('Europe/Moscow');

        
        this.currentYear = dayjs().format('YYYY');
        this.baseUrl = this.configService.get('APP_URL') as string;

    }
    private getDocTemplater() {
        const templatePath = this.storage.getFilePath(StorageType.APP, 'konstructor/templates/zoffer', 'april-template.docx');
        const content = fs.readFileSync(templatePath, 'binary');

        const zip = new PizZip(content);
        return new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    }
    async createZakupkiOffer(dto: ZakupkiOfferCreateDto) {
        this.resultPath = `konstructor/zoffer/${this.currentYear}/${dto.domain}/${dto.userId}`;
       
    
        const doc = this.getDocTemplater()
        this.contractPeriod = this.getContractPeriod(dto.contractStart, dto.contractEnd);
        const { documentDate, documentNumber } = await this.getDocumentDateAndNumber(dto.domain, dto.userId);
        this.documentNumber = documentNumber;
        this.documentName = `3 КП ${dto.total.shortName} ${documentNumber}.docx`;

        const providerData = await this.getProviderData(dto.provider);
        const otherProvider1Data = await this.getProviderOtherData(dto.otherProviders, 'provider1');
        const otherProvider2Data = await this.getProviderOtherData(dto.otherProviders, 'provider2');
        const recipientData = this.getRecipientData(dto.recipient);
        // const regionsNames = this.getRegions(dto.regions);
        const { infoblocksLeft, infoblocksRight } = this.documentInfoblockService.getInfoblocks(dto.complect, dto.regions);
        const totalProduct = this.totalRowService.getZofferData(dto.total);
        const providersSums = this.getSumsProviders(dto.otherProviders, totalProduct.totalSum, totalProduct.totalSumMonth);
        // const testingInfoblocksWithDescription = await this.getTotalInfoblocksData(dto.complect, dto.regions);
        const data = {
            ...providerData,
            ...otherProvider1Data,
            ...otherProvider2Data,
            ...recipientData,
            ...totalProduct,
            ...providersSums,
            documentDate,
            documentNumber,
            infoblocksLeft,
            infoblocksRight,
            contractPeriod: this.contractPeriod,
        }

        try {
            doc.render(data);



        } catch (error) {
            throw new Error(`Docx render error: ${error}`);
        }


        await this.saveFile(doc)
        const link = await this.createLink(dto.domain, dto.userId)
        this.setInBitrix(dto.domain, dto.companyId, dto.userId, link, documentNumber, dto.dealId)
        return {
            link,
            // testingInfoblocksWithDescription
        };
    }
    private async saveFile(doc: Docxtemplater) {
        const buf = doc.toBuffer();
        await this.storage.saveFile(buf, this.documentName, StorageType.PUBLIC, this.resultPath);
        // const pdf = await this.libreOfficeService.convertToPdf(this.storage.getFilePath(StorageType.PUBLIC, this.resultPath, this.documentName));

    }
    private async createLink(domain: string, userId: number,) {

        const rootLink = await this.fileLinkService.createPublicLink(domain, userId, 'konstructor', 'zoffer', this.currentYear, `${this.documentName}`);
        const link = `${this.baseUrl}${rootLink}`;
        return link
    }
    private async getProviderData(providerInitData: ProviderDto) {
        const rq = providerInitData.rq;
        const fullname = rq.shortname;
        const address = rq.registredAdress;
        const phone = rq.phone;
        const email = rq.email;
        const inn = rq.inn;


        return {
            providerFullName: fullname,
            providerAddress: address,
            providerPhone: phone,
            providerEmail: email,
            providerInn: inn,

        }

    }
    private async getProviderOtherData(otherProvidersInitData: OtherProvidersDto, type: 'provider1' | 'provider2') {
        const provider = otherProvidersInitData[type];
        let enumchick = Provider1FieldCode as typeof Provider1FieldCode | typeof Provider2FieldCode;
        if (type === 'provider2') {
            enumchick = Provider2FieldCode;
        }
        const providerCompanyName = provider.find(provider => provider.code === enumchick.SHORTNAME);
        const providerAddress = provider.find(provider => provider.code === enumchick.ADDRESS);
        const providerPhone = provider.find(provider => provider.code === enumchick.PHONE);
        const providerEmail = provider.find(provider => provider.code === enumchick.EMAIL);
        const providerInn = provider.find(provider => provider.code === enumchick.INN);
        const providerPosition = provider.find(provider => provider.code === enumchick.POSITION);
        const providerLetterText = provider.find(provider => provider.code === enumchick.LETTER_TEXT)?.value?.toString() || "" as string;
        const providerDirector = provider.find(provider => provider.code === enumchick.DIRECTOR);

        return {
            [`${type}FullName`]: providerCompanyName?.value || '',
            [`${type}Address`]: providerAddress?.value || '',
            [`${type}Phone`]: providerPhone?.value || '',
            [`${type}Email`]: providerEmail?.value ? `Email: ${providerEmail?.value}` : '',
            [`${type}Inn`]: providerInn?.value || '',
            [`${type}Position`]: providerPosition?.value || '',
            [`${type}Director`]: providerDirector?.value || '',
            [`${type}LetterText`]: this.prepareLetterText(providerLetterText),

        }

    }



    private getRecipientData(recipientInitData: RecipientDto) {
        const recipientName = recipientInitData.recipient;
        const recipientNameCase = recipientInitData.recipientCase;
        const positionCase = recipientInitData.positionCase;
        const recipientCompanyName = recipientInitData.companyName;
        const recipientCompanyAdress = recipientInitData.companyAdress;
        const recipientInn = recipientInitData.inn;
        return {
            recipientName,
            recipientNameCase,
            positionCase,
            recipientCompanyName,
            recipientCompanyAdress,
            recipientInn,
        }
    }

    async getDocumentDateAndNumber(domain: string, userId: number): Promise<{ documentDate: string, documentNumber: string }> {
        const filesCount = await this.storage.countFilesInDirectory(StorageType.PUBLIC, this.resultPath);

        const documentDate = dayjs().format('D MMMM YYYY [г.]');
        const documentNumber = `${documentDate.slice(0, 2)}${userId}-${filesCount + 1}`;
        return { documentDate, documentNumber };
    }

    // private getInfoblocks(complect: ComplectDto[], regions: string[]) {
    //     const infoblocksLeft: string[] = [];
    //     const infoblocksRight: string[] = [];
    //     const infoblocks: string[] = [];
    //     complect.forEach(iData => {

    //         iData.value.forEach(iBlock => {
    //             if (iBlock.code === 'reg') {
    //                 regions.map(regionName => infoblocks.push(regionName))
    //             } else {
    //                 iBlock.checked && infoblocks.push(iBlock.title || iBlock.name);
    //             }

    //         })
    //     })
    //     infoblocks.forEach((iblockName, index) => {
    //         if (index < infoblocks.length / 2) {
    //             infoblocksLeft.push(iblockName);
    //         } else {
    //             infoblocksRight.push(iblockName);
    //         }
    //     })
    //     // const infoblocksLeft = infoblocksFirst.join(', ');
    //     // const infoblocksRight = infoblocksSecond.join(', ');
    //     return { infoblocksLeft, infoblocksRight };
    // }
    // private getRegions(regions: RegionsDto): string[] {
    //     const resultRegions: string[] = [];
    //     [regions.inComplect, regions.favorite, regions.noWidth].map(region => {
    //         region.forEach(r => {
    //             resultRegions.push(r.infoblock)
    //         })
    //     });
    //     return resultRegions;
    // }




    private getContractPeriod(contractStart: string, contractEnd: string) {
        const contractStartFormatted = contractStart ? dayjs(contractStart).format('D MMMM YYYY [г.]') : '___________________________________';
        const contractEndFormatted = contractEnd ? dayjs(contractEnd).format('D MMMM YYYY [г.]') : '___________________________________';
        const period = `c ${contractStartFormatted} по ${contractEndFormatted}`;

        return period
    }

    private prepareLetterText(letterText: string) {
        const letterTextFormatted = letterText ? letterText.replace("{{period}}", this.contractPeriod) : '';
        return letterTextFormatted
    }
    private getSumsProviders(
        providers: OtherProvidersDto,
        totalSum: number,
        totalSumMonth: number,


    ) {
        const searchedCefficient1: number = Number(providers.provider1.find(provider => provider.code === Provider1FieldCode.PRICE_COEFFICIENT)?.value)

        const searchedCoefficient2: number = Number(providers.provider2.find(provider => provider.code === Provider2FieldCode.PRICE_COEFFICIENT)?.value)

        const coefficient1: number = searchedCefficient1 || 1.2
        const coefficient2: number = searchedCoefficient2 || 1.5
        const totalSumProvider1 = Number((totalSum * coefficient1).toFixed(2))
        const totalSumProvider2 = Number((totalSum * coefficient2).toFixed(2))
        const totalSumCaseProvider1 = formatRuble(totalSumProvider1)
        const totalSumCaseProvider2 = formatRuble(totalSumProvider2)
        const totalSumMonthProvider1 = Number((totalSumMonth * coefficient1).toFixed(2))
        const totalSumMonthProvider2 = Number((totalSumMonth * coefficient2).toFixed(2))
        const totalSumMonthCaseProvider1 = formatRuble(totalSumMonthProvider1)
        const totalSumMonthCaseProvider2 = formatRuble(totalSumMonthProvider2)
        return {
            totalSumProvider1,
            totalSumProvider2,
            totalSumCaseProvider1,
            totalSumCaseProvider2,
            totalSumMonthProvider1,
            totalSumMonthProvider2,
            totalSumMonthCaseProvider1,
            totalSumMonthCaseProvider2,

        }
    }

    private getCommentMessage(link: string, documentNumber: string) {
        const message = `📝 <a href="${link}" target="_blank">${this.documentName}</a>`;
        return message
    }

    async setInBitrix(domain: string, companyId: string, userId: number | string, link: string, documentNumber: string, dealId?: number | string) {
        const commentMessage = this.getCommentMessage(link, documentNumber as string);
        const { bitrix } = await this.pbx.init(domain)
        bitrix.batch.timeline.addTimelineComment(
            `add_timeline_company_${companyId}`,
            {

                ENTITY_ID: companyId,
                ENTITY_TYPE: BitrixEntityType.COMPANY,
                COMMENT: commentMessage,
                AUTHOR_ID: userId.toString(),

            })
        dealId && bitrix.batch.timeline.addTimelineComment(
            `add_timeline_deal_${dealId}`,
            {

                ENTITY_ID: dealId,
                ENTITY_TYPE: BitrixEntityType.DEAL,
                COMMENT: commentMessage,
                AUTHOR_ID: userId.toString(),
            })
        bitrix.api.callBatchWithConcurrency(1)
    }
}





