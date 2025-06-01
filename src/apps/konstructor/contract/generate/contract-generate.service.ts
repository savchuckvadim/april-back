import { Injectable } from "@nestjs/common";
import { ContractGenerateDto } from "./contract-generate.dto";
import { StorageService, StorageType } from "src/core/storage";
import { FileLinkService } from "src/core/file-link/file-link.service";
import { ConfigService } from "@nestjs/config";
import { PBXService } from "src/modules/pbx/pbx.servise";
import { BitrixEntityType, BitrixService } from "src/modules/bitrix";
import { LibreOfficeService } from "src/modules/libre-office/libre-office.service";
import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import dayjs from "dayjs";
import 'dayjs/locale/ru';
import localizedFormat from "dayjs/plugin/localizedFormat";
import { ProductRowDto } from "../../document-generate";
import { ProviderService, RqEntity } from "../../../../modules/garant/provider";
import { DocumentTotalRowService } from "../../document-generate/product-rows/total-row.service";
import { ClientTypeEnum } from "../../document-generate/type/client.type";
import { ContractSpecificationDto } from "../../document-generate/dto/specification/specification.dto";
import { ContractGenerateTemplateProps } from "./contract-generate.type";
import { DocumentInfoblockService } from "../../document-generate/infoblocks/infoblock.service";
interface Product {
    productNumber: number;
    productName: string;
    productQuantity: number;
    productMeasure: string;
    productPrice: number | string;
    productSum: number | string;
    complect_sup?: string;
    complectName?: string;
    productPriceDefault?: string;
}

@Injectable()
export class ContractGenerateService {
    private readonly baseUrl: string;
    private bitrix: BitrixService;
    private documentName: string = 'Договор';
    private documentNumber: string = '';
    private provider: RqEntity;
    private clientType: ClientTypeEnum;
    private contractType: string;
    private currentYear: string;
    private resultPath: string;

    constructor(
        private readonly storage: StorageService,
        private readonly fileLinkService: FileLinkService,
        private readonly configService: ConfigService,
        private readonly pbx: PBXService,
        private readonly libreOfficeService: LibreOfficeService,
        private readonly providerService: ProviderService,
        private readonly totalRowService: DocumentTotalRowService,
        private readonly documentInfoblockService: DocumentInfoblockService
    ) {
        dayjs.extend(localizedFormat);
        dayjs.locale('ru');
        this.currentYear = dayjs().format('YYYY');

        this.baseUrl = this.configService.get('APP_URL') as string;

    }

    async generateContract(dto: ContractGenerateDto) {
        this.resultPath = `konstructor/contract/${this.currentYear}/${dto.domain}/${dto.userId}`;

        const { bitrix } = await this.pbx.init(dto.domain);
        this.bitrix = bitrix;
        const provider = await this.providerService.findById(dto.providerId);
        this.clientType = dto.clientType;
        this.contractType = dto.contractType;
        if (!provider) {
            throw new Error('Provider not found');
        }
        this.provider = provider;
        const templatePath = this.storage.getFilePath(StorageType.APP, 'konstructor/templates/contract', 'template.docx');
        const content = fs.readFileSync(templatePath, 'binary');

        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        const { documentDate, documentNumber } = await this.getDocumentDateAndNumber(dto.domain, dto.userId);
        this.documentNumber = documentNumber;
        this.documentName = `Договор ${dto.total.shortName} ${documentNumber}.docx`;

        const data = await this.prepareDocumentData(dto, documentDate, documentNumber);

        try {
            doc.render(data);
        } catch (error) {
            throw new Error(`Docx render error: ${error}`);
        }

        const buf = doc.toBuffer();
        // const mainPath = `konstructor/contract/${dto.domain}/${dto.userId}`;
        await this.storage.saveFile(buf, this.documentName, StorageType.PUBLIC, this.resultPath);

        const rootLink = await this.fileLinkService.createPublicLink(dto.domain, dto.userId, 'konstructor', 'contract', this.currentYear, `${this.documentName}`);
        const link = `${this.baseUrl}${rootLink}`;

        await this.setInBitrix(dto.companyId, dto.userId, link, documentNumber, dto.dealId);

        return {
            link
        };
    }

    // async getDocument(dto: ContractGenerateDto) {
    //     const isSupplyReport = dto.isSupplyReport;
    //     return isSupplyReport ? this.getSupplyDocument(dto) : this.getContractDocument(dto);
    // }

    private async getContractDocument(dto: ContractGenerateDto) {
        return this.generateContract(dto);
    }

    // private async getSupplyDocument(dto: ContractGenerateDto) {
    //     return this.generateContract(dto);
    // }

    private async getDocumentDateAndNumber(domain: string, userId: number): Promise<{ documentDate: string, documentNumber: string }> {
        const filesCount = await this.storage.countFilesInDirectory(StorageType.PUBLIC, `konstructor/contract/${domain}/${userId}`);
        const documentDate = dayjs().format('D MMMM YYYY [г.]');
        const documentNumber = `${documentDate.slice(0, 2)}${userId}-${filesCount + 1}`;
        return { documentDate, documentNumber };
    }

    private async prepareDocumentData(dto: ContractGenerateDto, documentDate: string, documentNumber: string): Promise<ContractGenerateTemplateProps> {
        const providerData = await this.getProviderData(this.provider);
        // const recipientData = this.getRecipientData(dto.recipient);
        const contractData = this.getContractData(dto.contract);
        const supplyData = this.getSupplyData(dto.supply);
        const totalData = this.totalRowService.getContractData(dto.total, this.clientType);
        const contractStart = dto.contractStart || "________________________________";
        const contractEnd = dto.contractEnd || "________________________________";
        const contractNumber = dto.contractNumber || "________________________________";
        const contractCreateDate = dto.contractCreateDate || "________________________________";

        const contractPeriod = this.getContractPeriod(contractStart, contractEnd);
        const roles = this.getRoles(dto.contractType);

        const headerText = this.getContractHeaderText(dto.contractType, this.clientType, dto.bxrq, this.provider);
        const products = this.getProducts(dto.rows, contractData.contractName, dto.contractType !== 'service', dto.contract.prepayment, this.clientType);
        const specificationData = this.getSpecificationData(dto.domain, dto.contractSpecificationState);
        const { infoblocksLeft, infoblocksRight } = this.documentInfoblockService.getInfoblocks(dto.complect, dto.regions);

        return {
            contract_number: documentNumber,
            contract_date: documentDate,
            header: headerText,
            contract_start: contractStart,
            contract_end: contractEnd,
            we_role: roles.provider,
            we_rq: 'dto.bxrq.rq',
            we_direct_position: providerData.providerCompanyDirectorPosition,
            we_direct_fio: providerData.providerCompanyDirectorName,
            client_role: roles.client,
            client_rq: 'dto.bxrq.rq',
            client_direct_position: dto.bxrq.fields.find(field => field.code === 'position')?.value,
            client_direct_fio: dto.bxrq.fields.find(field => field.code === 'director')?.value,
            complect_name: specificationData.complect_name,
            specification_pk: specificationData.specification_pk,
            specification_pk_comment: specificationData.specification_pk_comment,
            specification_dway: specificationData.specification_dway,
            specification_dway_comment: specificationData.specification_dway_comment,
            specification_email_comment: specificationData.specification_email_comment,
            specification_complect_name: specificationData.complect_name,
            specification_complect_name_comment: dto.total.name,
            infoblocks_left: infoblocksLeft,
            infoblocks_right: infoblocksRight,
            supply_contract: specificationData.supply_contract,
            supply_comment_1: specificationData.supply_comment_1,
            logins_quantity: specificationData.logins_quantity,
            contract_pay_date: dto.firstPayDate || '________________________________',
            productNumber: totalData.productNumber,
            productName: totalData.productName,
            productQuantity: totalData.productQuantity,
            productMeasure: totalData.productMeasure,
            productPrice: totalData.productPrice,
            productSum: totalData.productSum,
            // ...providerData,
            // // ...recipientData,
            // ...contractData,
            // ...supplyData,
            // ...totalData,
            // ...roles,
            // ...specificationData,
            // headerText,
            // products,
            // documentDate,
            // documentNumber,
            // contractPeriod,
        } as ContractGenerateTemplateProps;
    }

    private getContractHeaderText(contractType: string, clientType: ClientTypeEnum, clientRq: any, providerRq: RqEntity): string {
        const roles = this.getRoles(contractType);
        const providerRole = roles.provider;
        const clientRole = roles.client;

        const providerType = providerRq.type;
        const providerCompanyFullName = providerRq.fullname;
        const providerCompanyDirectorName = providerRq.director;
        const providerCompanyDirectorPosition = providerRq.position;
        const providerCompanyDirectorNameCase = this.inflectName(providerCompanyDirectorName, 'родительный');
        const providerCompanyDirectorPositionCase = this.getNounCase(providerCompanyDirectorPosition, 'родительный');
        const providerCompanyBased = providerRq.based;

        let clientCompanyFullName = ' __________________________________________________________ ';
        let clientCompanyDirectorNameCase = '____________________________________________________';
        let clientCompanyDirectorPositionCase = '______________________________________________';
        let clientCompanyBased = 'Устава';

        if (clientRq?.fields) {
            for (const rqItem of clientRq.fields) {
                if (rqItem.value) {
                    if (rqItem.code === 'fullname' && (clientType === 'ip' || clientType === 'org' || clientType === 'org_state')) {
                        clientCompanyFullName = rqItem.value;
                    } else if (rqItem.code === 'personName' && clientType === 'fiz') {
                        clientCompanyFullName = rqItem.value;
                    } else if (rqItem.code === 'position_case') {
                        clientCompanyDirectorPositionCase = rqItem.value;
                    } else if (rqItem.code === 'director_case') {
                        clientCompanyDirectorNameCase = rqItem.value;
                    } else if (rqItem.code === 'based') {
                        clientCompanyBased = rqItem.value;
                    }
                }
            }
        }

        let headerText = `${providerCompanyFullName} , официальный партнер компании "Гарант", именуемый в дальнейшем "${providerRole}`;

        if (providerType === 'org' || providerType === 'org_state') {
            headerText += `, в лице ${providerCompanyDirectorPositionCase} ${providerCompanyDirectorNameCase}, действующего(-ей) на основании ${providerCompanyBased}`;
        }

        headerText += ` с одной стороны и ${clientCompanyFullName}, именуемое(-ый) в дальнейшем "${clientRole}`;

        if (clientType === 'org' || clientType === 'org_state') {
            headerText += `, в лице ${clientCompanyDirectorPositionCase} ${clientCompanyDirectorNameCase}, действующего(-ей) на основании ${clientCompanyBased}`;
        }

        if (clientType === 'ip') {
            headerText += `, действующего(-ей) на основании ${clientCompanyBased}`;
        }

        headerText += ' с другой стороны, заключили настоящий Договор о нижеследующем:';

        return headerText;
    }

    private getRoles(contractType: string): { provider: string; client: string } {
        let clientRole = 'Заказчик';
        let providerRole = 'Исполнитель';

        switch (contractType) {
            case 'abon':
            case 'key':
                clientRole = 'Покупатель';
                providerRole = 'Поставщик';
                break;
            case 'lic':
                clientRole = 'Лицензиат';
                providerRole = 'Лицензиар';
                break;
            default:
                clientRole = 'Заказчик';
                providerRole = 'Исполнитель';
                break;
        }

        return {
            provider: providerRole,
            client: clientRole,
        };
    }

    private getProducts(arows: ProductRowDto[], contractName: string, isProduct: boolean, contractCoefficient: number, clientType: ClientTypeEnum): Product[] {
        const contractFullName = isProduct ? `${contractName} длительность ${contractCoefficient} мес.` : contractName;
        const products: Product[] = [];

        for (let i = 0; i < arows.length; i++) {
            const row = arows[i];
            const productQuantity = clientType === ClientTypeEnum.ORG_STATE ? 1 : row.price.quantity;

            products.push({
                productNumber: i + 1,
                productName: `${contractFullName}(${row.name})`,
                productQuantity: productQuantity,
                productMeasure: row.price.measure.name,
                productPrice: row.price.current,
                productSum: row.price.sum,
            });
        }

        return products;
    }

    private getSupplyProducts(arows: any[], contractName: string, isProduct: boolean, contractCoefficient: number, clientType: ClientTypeEnum): Product[] {
        const contractFullName = isProduct ? `${contractName} длительность ${contractCoefficient} мес.` : contractName;
        const products: Product[] = [];

        for (let i = 0; i < arows.length; i++) {
            const row = arows[i];
            const productQuantity = row.price.quantity;
            const productContractCoefficient = row.product.contractCoefficient;
            const quantity = productQuantity * productContractCoefficient;
            const complect_sup = row.productType === 'garant' ? row.currentSupply.name : '';

            const productPrice = Number(row.price.current).toFixed(2);
            const productSum = Number(row.price.sum).toFixed(2);
            const productPriceDefault = Number(row.price.default).toFixed(2);

            products.push({
                productNumber: i + 1,
                productName: `${contractFullName}(${row.name})`,
                productQuantity: productQuantity,
                productMeasure: row.price.measure.name,
                productPrice: productPrice,
                productSum: productSum,
                complect_sup: complect_sup,
                complectName: row.name,
                productPriceDefault: productPriceDefault,
            });
        }

        return products;
    }





    private getSpecificationData(domain: string, specification: ContractSpecificationDto) {
        let infoblocks = '';
        let lt = '';
        let supplyContract = '';
        let licLong = '';
        let loginsQuantity = '';
        let contractInternetEmail = '_____________________________________________________';
        let supplyComment = '';
        let specification_pk = '';
        let specification_pk_comment1 = '';
        let specification_pk_comment = '';
        let complect_name = '';
        let specification_email_comment = '';
        let specification_services = '';
        let specification_distributive = '';
        let specification_distributive_comment = '';
        let specification_dway = '';
        let specification_dway_comment = '';

        for (const value of specification.items) {
            if (domain === 'april-garant.bitrix24.ru') {
                if (value.code === 'specification_ibig' || value.code === 'specification_ismall') {
                    infoblocks += value.value + '\n';
                }
            } else {
                if (value.code === 'specification_iblocks') {
                    infoblocks += value.value + '\n';
                }
            }

            if (value.code === 'complect_name') {
                complect_name = domain !== 'gsr.bitrix24.ru' ? `\n${value.value}\n` : value.value;
            }

            if (['specification_ers', 'specification_ers_packets', 'specification_ers_in_packets', 'specification_ifree'].includes(value.code)) {
                infoblocks += value.value + '\n';
            }

            if (value.code === 'specification_services') {
                specification_services += value.value + '\n';
            }

            if (['specification_lt_free', 'specification_lt_free_services', 'specification_lt_packet', 'specification_lt_services'].includes(value.code)) {
                lt += `\n${value.value}\n`;
            }

            if (value.code === 'specification_supply') {
                supplyContract += value.value + '\n';
            }

            if (value.code === 'specification_supply_comment') {
                supplyComment += value.value + '\n';
            }

            if (value.code === 'lic_long') {
                licLong = value.value;
            }

            if (value.code === 'specification_supply_quantity') {
                loginsQuantity = value.value;
            }

            // if (value.code === 'contract_internet_email') {
            //     contractInternetEmail = value.value;
            // }

            if (value.code === 'specification_pk') {
                specification_pk = 'Правовая поддержка: ' + value.value;
            }

            if (value.code === 'specification_pk_comment1') {
                specification_pk_comment1 = value.value;
            }

            if (value.code === 'specification_pk_comment') {
                specification_pk_comment = value.value;
            }

            if (value.code === 'specification_email_comment') {
                specification_email_comment = value.value;
            }

            if (value.code === 'specification_distributive') {
                specification_distributive = value.value;
            }

            if (value.code === 'specification_distributive_comment') {
                specification_distributive_comment = value.value;
            }

            if (value.code === 'specification_dway') {
                specification_dway = value.value;
            }

            if (value.code === 'specification_dway_comment') {
                specification_dway_comment = value.value;
            }
        }

        return {
            complect_name,
            infoblocks,
            specification_services,
            legal_techs: lt,
            supply_contract: supplyContract,
            supply_comment_1: supplyComment,
            logins_quantity: loginsQuantity,
            lic_long: licLong,
            contract_internet_email: contractInternetEmail,
            specification_email_comment,
            specification_pk,
            specification_pk_comment1,
            specification_pk_comment,
            specification_distributive,
            specification_distributive_comment,
            specification_dway,
            specification_dway_comment,
        };
    }

    private inflectName(name: string, case_: string): string {
        // TODO: Implement name inflection logic
        return name;
    }

    private getNounCase(noun: string, case_: string): string {
        // TODO: Implement noun case logic
        return noun;
    }


    private async getProviderData(provider: RqEntity) {
        const rq = provider;
        return {
            providerFullName: rq.shortname,
            providerAddress: rq.registredAdress,
            providerPhone: rq.phone,
            providerEmail: rq.email,
            providerInn: rq.inn,
            providerBank: rq.bank,
            providerBik: rq.bik,
            providerRs: rq.rs,
            providerKs: rq.ks,
            providerBankAddress: rq.bankAdress,
            providerCompanyDirectorPosition: rq.position,
            providerCompanyDirectorName: rq.director,
        };
    }

    private getRecipientData(recipient: any) {
        return {
            recipientName: recipient.recipient,
            recipientNameCase: recipient.recipientCase,
            positionCase: recipient.positionCase,
            recipientCompanyName: recipient.companyName,
            recipientCompanyAdress: recipient.companyAdress,
            recipientInn: recipient.inn,
        };
    }

    private getContractData(contract: any) {
        const generalContract = contract.contract;
        return {
            contractName: generalContract.name,
            contractCode: contract.code,
            contractNumber: contract.number,
            contractPrepayment: contract.prepayment,
            contractDiscount: contract.discount,
            contractProductName: generalContract.productName,
        };
    }

    private getSupplyData(supply: any) {
        return {
            supplyName: supply.name,
            supplyType: supply.type,
            supplyQuantity: supply.contractPropSuppliesQuantity,
            supplyComment: supply.contractPropComment,
            supplyEmail: supply.contractPropEmail,
        };
    }

    // private getTotalData(total: any) {
    //     const price = total.price;
    //     return {
    //         totalProductName: total.name,
    //         totalSupplyName: total.currentSupply.name,
    //         totalSupplyFullName: total.currentSupply.quantityForKp,
    //         totalSumMonth: Number((price.month / total.product.contractCoefficient).toFixed(2)),
    //         totalSum: Number((price.sum / total.product.contractCoefficient).toFixed(2)),
    //         totalQuantity: Number((price.quantity * total.product.contractCoefficient).toFixed(2)),
    //         totalMeasure: 'мес.',
    //     };
    // }

    private getContractPeriod(contractStart: string, contractEnd: string) {
        const contractStartFormatted = contractStart ? dayjs(contractStart).format('D MMMM YYYY [г.]') : '___________________________________';
        const contractEndFormatted = contractEnd ? dayjs(contractEnd).format('D MMMM YYYY [г.]') : '___________________________________';
        return `c ${contractStartFormatted} по ${contractEndFormatted}`;
    }

    private getCommentMessage(link: string, documentNumber: string) {
        const message = `📝 <a href="${link}" target="_blank">${this.documentName}</a>`;
        return message;
    }

    private async setInBitrix(companyId: string, userId: number | string, link: string, documentNumber: string, dealId?: number | string) {
        const commentMessage = this.getCommentMessage(link, documentNumber);

        this.bitrix.batch.timeline.addTimelineComment(
            `add_timeline_company_${companyId}`,
            {
                ENTITY_ID: companyId,
                ENTITY_TYPE: BitrixEntityType.COMPANY,
                COMMENT: commentMessage,
                AUTHOR_ID: userId.toString(),
            }
        );

        if (dealId) {
            this.bitrix.batch.timeline.addTimelineComment(
                `add_timeline_deal_${dealId}`,
                {
                    ENTITY_ID: dealId,
                    ENTITY_TYPE: BitrixEntityType.DEAL,
                    COMMENT: commentMessage,
                    AUTHOR_ID: userId.toString(),
                }
            );
        }

        await this.bitrix.api.callBatchWithConcurrency(1);
    }
}

