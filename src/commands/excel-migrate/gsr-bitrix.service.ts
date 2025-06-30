import { EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix/core";
import { Injectable } from "@nestjs/common";
import { MigrateToBxDto } from "./dto/migrate-to-bx.dto";

import { PortalModel } from "src/modules/portal/services/portal.model";
import { GsrMigrateBitrixDealService } from "./services/bitrix/gsr-migrate-bxdeal.service";
import { GsrMigrateBitrixCompanyService } from "./services/bitrix/gsr-migrate-bxcompany.service";
import { GsrMigrateBitrixProductRowService } from "./services/bitrix/gsr-migrate-bxproduct-row.service";
import { GsrMigrateBitrixContactService } from "./services/bitrix/gsr-migrate-bxcontact.service";
import { BitrixService } from "src/modules/bitrix/";
import { PBXService } from "src/modules/pbx/pbx.servise";
import { IBitrixBatchResponseResult } from "src/modules/bitrix/core/interface/bitrix-api.intterface";

@Injectable()
export class GsrBitrixService {

    private portal: PortalModel
    private bitrix: BitrixService
    constructor(
        private readonly pbx: PBXService,

        private readonly companyService: GsrMigrateBitrixCompanyService,
        private readonly dealService: GsrMigrateBitrixDealService,
        private readonly productRowService: GsrMigrateBitrixProductRowService,
        private readonly contactService: GsrMigrateBitrixContactService,

    ) { }

    async migrateToBitrix(domain: string, userId: string, data: MigrateToBxDto[]) {

        const { bitrix, PortalModel } = await this.pbx.init(domain)
        this.bitrix = bitrix
        this.portal = PortalModel


        // // передаём shared context
        this.companyService.setContext(this.bitrix, this.portal, userId);
        this.dealService.setContext(this.bitrix, this.portal, userId);
        this.productRowService.setContext(this.bitrix, this.portal, userId);
        this.contactService.setContext(this.bitrix, this.portal, userId);
        const results = [] as IBitrixBatchResponseResult[][]
        let count = 0
        // for (let i = 0; i < data.length; i += 1) {
        //     const chunk = data.slice(i, i + 1)


            // chunk.
            data.forEach((element, index) => {
                // console.log(index)
                // if (index > 1) {

                const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.ADD}.${element.id}`
                this.companyService.getCompanyCommand(element, companyCmd)

                const dealCmd = `${EBxNamespace.CRM}.${EBXEntity.DEAL}.${EBxMethod.ADD}.${element.id}`
                const cntcCmds = this.contactService.getContactCommand(element, companyCmd)

                this.dealService.getDealCommand(element, companyCmd, dealCmd, cntcCmds)
                this.productRowService.getProductRowCommand(element, dealCmd)
                this.dealService.getDealUpdateCommand(cntcCmds, dealCmd)

                // }
            });

            const result = await this.bitrix.api.callBatchWithConcurrency(1)
            console.log(result)
            results.push(result)
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

        }
    }

    async getDeals(domain: string, data: MigrateToBxDto[]) {
        const { portal, bitrix, PortalModel } = await this.pbx.init(domain)
        this.portal = PortalModel;
        this.bitrix = bitrix
        // this.bitrixApi = this.bitrixApiFactory.create(this.portal.getPortal());
        // const pDealCategory = this.portal.getDealCategoryByCode('service_base')



        data.forEach((element, index) => {
            if (element.id) {
                const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.LIST}.${element.id}`
                this.bitrix.batch.company.getList(
                    companyCmd,
                    {
                        UF_CRM_USER_CARDNUM: element.id.toString()
                    },
                    ['ID', 'TITLE']

                )



            }
        });
        const response = await this.bitrix.api.callBatchWithConcurrency(1);
        let total = 0
        const result = {
            result: {} as { [key: string]: any; },
            total
        }
        response.map(r => {


            for (const i in r.result) {
                if (r.result[i][0]) {
                    // r.result[i].map(item => result.result.push({ [`${i}_${result.total}`]: item }))
                    result.result[`${i}_${result.total}`] = r.result[i]
                } else {
                    result.result.push({ [`${i}`]: null })
                }

                result.total += 1
            }

        })
        const doubles = Object.values(result.result).filter(value => value.length > 1)
        return { result: result.result, doubles: doubles }
    }


    async updateDeals(domain: string, userId: string, data: MigrateToBxDto[]) {
        const { portal, bitrix, PortalModel } = await this.pbx.init(domain)
        this.portal = PortalModel;
        this.bitrix = bitrix
        const pDealContractEndField2 = this.portal.getDealFieldBitrixIdByCode('contract_end')


        const pDealCategory = this.portal.getDealCategoryByCode('service_base')


        this.productRowService.setContext(this.bitrix, this.portal, userId);

        data.forEach((element, index) => {
            if (element.id && element.id == '61-40762-000464') {
                //@ts-ignore

                const companyCmd = `${EBxNamespace.CRM}.${EBXEntity.COMPANY}.${EBxMethod.LIST}.${element.id}`
                this.bitrix.batch.company.getList(
                    companyCmd,
                    {
                        UF_CRM_USER_CARDNUM: element.id.toString()
                    },
                    ['ID', 'TITLE']

                )

                this.bitrix.batch.deal.getList(
                    `list_deals_of_${element.id.toString()}`,
                    {
                        CATEGORY_ID: pDealCategory?.bitrixId || '',
                        COMPANY_ID: `$result[${companyCmd}][0][ID]`
                    },
                    ['ID', 'TITLE']

                )

                this.bitrix.batch.deal.get(
                    `get_deals_of_${element.id.toString()}`,
                    `$result[list_deals_of_${element.id.toString()}][0][ID]`,


                )
                const armIds = element.products.map(p => p.armId)
                this.bitrix.batch.deal.update(
                    `update_deal_${element.id.toString()}`,
                    `$result[get_deals_of_${element.id.toString()}][ID]`,
                    {
                        UF_CRM_RPA_ARM_COMPLECT_ID: armIds,
                        [pDealContractEndField2]: element.contract.contractEndDate,

                    }


                )
                this.productRowService.getProductRowCommandById(element, `$result[get_deals_of_${element.id.toString()}][ID]`)


                this.bitrix.batch.deal.get(
                    `post_get_deals_of_${element.id.toString()}`,
                    `$result[get_deals_of_${element.id.toString()}][ID]`,


                )

            }
        });
        const response = await this.bitrix.api.callBatchWithConcurrency(1);
        // let total = 0
        const result = {
            result: response, // {} as { [key: string]: any; },
            // total
        }
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
        return { result: result.result, data }
    }

}
