import { EBXEntity, EBxMethod, EBxNamespace } from 'src/modules/bitrix/core';
import { Injectable } from '@nestjs/common';
import { MigrateToBxDto } from './dto/migrate-to-bx.dto';
import { SheetData } from './dto/sheet-data.dto';
import { SheetDataToMigrateConverter } from './services/sheet-data-to-migrate.converter';
import * as fs from 'fs';
import * as path from 'path';

import { PortalModel } from 'src/modules/portal/services/portal.model';
import { GsrMigrateBitrixDealService } from './services/bitrix/gsr-migrate-bxdeal.service';
import { GsrMigrateBitrixCompanyService } from './services/bitrix/gsr-migrate-bxcompany.service';
import { GsrMigrateBitrixProductRowService } from './services/bitrix/gsr-migrate-bxproduct-row.service';
import { GsrMigrateBitrixContactService } from './services/bitrix/gsr-migrate-bxcontact.service';
import { BitrixService } from 'src/modules/bitrix/';
import { PBXService } from '@/modules/pbx/pbx.service';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PbxDealCategoryCodeEnum } from '@/modules/portal/services/types/deals/portal.deal.type';
import { gsrMigrateDataDto } from './gsr.nigrate-dto';
import { delay } from '@/lib';

@Injectable()
export class GsrBitrixService {
    private portal: PortalModel;
    private bitrix: BitrixService;
    constructor(
        private readonly pbx: PBXService,
        private readonly converter: SheetDataToMigrateConverter,
        private readonly companyService: GsrMigrateBitrixCompanyService,
        private readonly dealService: GsrMigrateBitrixDealService,
        private readonly productRowService: GsrMigrateBitrixProductRowService,
        private readonly contactService: GsrMigrateBitrixContactService,
    ) { }

    async migrateToBitrix(
        domain: string,
        userId: string,
        data: MigrateToBxDto[],
    ) {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        this.bitrix = bitrix;
        this.portal = PortalModel;

        // // передаём shared context
        this.companyService.setContext(this.bitrix, this.portal, userId);
        this.dealService.setContext(this.bitrix, this.portal, userId);
        this.productRowService.setContext(this.bitrix, this.portal, userId);
        this.contactService.setContext(this.bitrix, this.portal, userId);
        const results = [] as IBitrixBatchResponseResult[][];
        let count = 0;
        // for (let i = 0; i < data.length; i += 1) {
        //     const chunk = data.slice(i, i + 1)

        // chunk.

        for (const element of data) {
            const companyId = await this.companyService.getCompanyResutId(element);
            console.log(companyId);

            const contactIds = await this.contactService.getContactSetContactsByCompanyId(
                element,
                companyId.toString(),
            );

            const dealId = await this.dealService.getDealSet(
                element,
                companyId.toString()

            );
            await this.productRowService.getProductRowSetByDealId(element, dealId);
            await this.dealService.getDealUpdateWithContactIds(dealId, contactIds);

            await delay(3000)

        }


        const result = await this.bitrix.api.callBatchWithConcurrency(1);
        console.log(result);
        results.push(result);
        // count += 1
        // await new Promise(resolve => {
        //     console.log('wait')
        //     console.log(chunk)
        //     console.log(count)
        //     setTimeout(resolve, 700)
        // })
        // }
        return {
            // commands,
            // portal: this.portal,
            count: data.length,
            results,
        };
    }

    async migrateToBitrixBatch(
        domain: string,
        userId: string,
        data: MigrateToBxDto[],
    ) {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        this.bitrix = bitrix;
        this.portal = PortalModel;

        // // передаём shared context
        this.companyService.setContext(this.bitrix, this.portal, userId);
        this.dealService.setContext(this.bitrix, this.portal, userId);
        this.productRowService.setContext(this.bitrix, this.portal, userId);
        this.contactService.setContext(this.bitrix, this.portal, userId);
        const results = [] as IBitrixBatchResponseResult[][];
        let count = 0;
        // for (let i = 0; i < data.length; i += 1) {
        //     const chunk = data.slice(i, i + 1)

        // chunk.
        data.forEach((element, index) => {
            // console.log(index)
            // if (index > 1) {

            const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.ADD}.${element.id}`;
            this.companyService.getCompanyCommand(element, companyCmd);

            const dealCmd = `${EBxNamespace.CRM}.${EBXEntity.DEAL}.${EBxMethod.ADD}.${element.id}`;
            const cntcCmds = this.contactService.getContactCommand(
                element,
                companyCmd,
            );

            this.dealService.getDealCommand(
                element,
                companyCmd,
                dealCmd,
                cntcCmds,
            );
            this.productRowService.getProductRowCommand(element, dealCmd);
            this.dealService.getDealUpdateCommand(cntcCmds, dealCmd);

            // }


        });

        const result = await this.bitrix.api.callBatchWithConcurrency(1);
        console.log(result);
        results.push(result);
        // count += 1
        // await new Promise(resolve => {
        //     console.log('wait')
        //     console.log(chunk)
        //     console.log(count)
        //     setTimeout(resolve, 700)
        // })
        // }
        return {
            // commands,
            // portal: this.portal,
            count: data.length,
            results,
        };
    }

    async getDeals(domain: string, data: MigrateToBxDto[]) {
        const { portal, bitrix, PortalModel } = await this.pbx.init(domain);
        this.portal = PortalModel;
        this.bitrix = bitrix;
        // this.bitrixApi = this.bitrixApiFactory.create(this.portal.getPortal());
        // const pDealCategory = this.portal.getDealCategoryByCode('service_base')

        data.forEach((element, index) => {
            if (element.id) {
                const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.LIST}.${element.id}`;
                this.bitrix.batch.company.getList(
                    companyCmd,
                    {
                        UF_CRM_USER_CARDNUM: element.id.toString(),
                    },
                    ['ID', 'TITLE'],
                );
            }
        });
        const response = await this.bitrix.api.callBatchWithConcurrency(1);
        let total = 0;
        const result = {
            result: {} as { [key: string]: any },
            total,
        };
        response.map(r => {
            for (const i in r.result) {
                if (r.result[i][0]) {
                    // r.result[i].map(item => result.result.push({ [`${i}_${result.total}`]: item }))
                    result.result[`${i}_${result.total}`] = r.result[i];
                } else {
                    result.result.push({ [`${i}`]: null });
                }

                result.total += 1;
            }
        });
        const doubles = Object.values(result.result).filter(
            value => value.length > 1,
        );
        return { result: result.result, doubles: doubles };
    }

    async updateDeals(domain: string, userId: string, data: MigrateToBxDto[]) {
        const { portal, bitrix, PortalModel } = await this.pbx.init(domain);
        this.portal = PortalModel;
        this.bitrix = bitrix;
        const pDealContractEndField2 =
            this.portal.getDealFieldBitrixIdByCode('contract_end');

        const pDealCategory = this.portal.getDealCategoryByCode(PbxDealCategoryCodeEnum.service_base);

        this.productRowService.setContext(this.bitrix, this.portal, userId);

        data.forEach((element, index) => {
            if (element.id && element.id == '61-40762-000464') {
                //@ts-ignore

                const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.LIST}.${element.id}`;
                this.bitrix.batch.company.getList(
                    companyCmd,
                    {
                        UF_CRM_USER_CARDNUM: element.id.toString(),
                    },
                    ['ID', 'TITLE'],
                );

                this.bitrix.batch.deal.getList(
                    `list_deals_of_${element.id.toString()}`,
                    {
                        CATEGORY_ID: pDealCategory?.bitrixId || '',
                        COMPANY_ID: `$result[${companyCmd}][0][ID]`,
                    },
                    ['ID', 'TITLE'],
                );

                this.bitrix.batch.deal.get(
                    `get_deals_of_${element.id.toString()}`,
                    `$result[list_deals_of_${element.id.toString()}][0][ID]`,
                );
                const armIds = element.products.map(p => p.armId);
                this.bitrix.batch.deal.update(
                    `update_deal_${element.id.toString()}`,
                    `$result[get_deals_of_${element.id.toString()}][ID]`,
                    {
                        UF_CRM_RPA_ARM_COMPLECT_ID: armIds,
                        [pDealContractEndField2]:
                            element.contract.contractEndDate,
                    },
                );
                this.productRowService.getProductRowCommandById(
                    element,
                    `$result[get_deals_of_${element.id.toString()}][ID]`,
                );

                this.bitrix.batch.deal.get(
                    `post_get_deals_of_${element.id.toString()}`,
                    `$result[get_deals_of_${element.id.toString()}][ID]`,
                );
            }
        });
        const response = await this.bitrix.api.callBatchWithConcurrency(1);
        // let total = 0
        const result = {
            result: response, // {} as { [key: string]: any; },
            // total
        };
        // response.map(r => {

        //     for (const i in r.result) {
        //         if (r.result[i][0]) {
        //             // r.result[i].map(item => result.result.push({ [`${i}_${result.total}`]: item }))
        //             result.result[`${i}_${result.total}`] = r.result[i]
        //         } else {
        //             result.result.push({ [`${i}`]: null })
        //         }

        //         result.total += 1
        //     }

        // })
        // const doubles = Object.values(result.result).filter(value => value.length > 1)
        return { result: result.result, data };
    }

    /**
     * Загружает данные из JSON файла и преобразует в формат для миграции
     * @param jsonFilePath Путь к JSON файлу (например, uploads/gsr.last-migrate.json)
     */
    async loadAndMigrateFromJson(
        domain: string,
        userId: string,
        jsonFilePath: string,
    ) {
        // Загружаем JSON файл
        const filePath = path.isAbsolute(jsonFilePath)
            ? jsonFilePath
            : path.join(process.cwd(), jsonFilePath);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Файл не найден: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const sheetsData: SheetData[] = JSON.parse(fileContent);

        // Преобразуем в формат MigrateToBxDto
        // const migrateData = this.converter.convertSheetsToMigrate(sheetsData);
        const migrateData = gsrMigrateDataDto as MigrateToBxDto[];
        // Выполняем миграцию
        return await this.migrateToBitrix(domain, userId, migrateData);
    }

    /**
     * Преобразует массив SheetData в MigrateToBxDto[] без выполнения миграции
     * Полезно для предварительного просмотра данных
     */
    convertSheetDataToMigrate(sheetsData: SheetData[]): MigrateToBxDto[] {
        return this.converter.convertSheetsToMigrate(sheetsData);
    }
}
