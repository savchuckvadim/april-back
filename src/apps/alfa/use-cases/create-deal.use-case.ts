import { Injectable, Logger } from "@nestjs/common";
import { CreateDealDto } from "../dto/create-deal.dto";
import { BxDealService } from "../services/bx-deal.service";
import { BxFieldsService } from "../services/bx-field.service";
import { DealFieldHelperService } from "../services/deal-helper/deal-field-helper.service";
import { DealFieldValuesHelperService } from "../services/deal-helper/deal-values-helper.service";
import { PBXService } from "@/modules/pbx";
import { bxProductData } from "../bx-data/bx-product-data";
import { DealFieldsTemplate } from "../type/deal-field.type";
import { BxSmartService } from "../services/bx-smart.service";
import { BxCompanyService } from "../services/bx-company.service";
import { BxDealDataKeys } from "../bx-data/bx-data";
import { BxProductService } from "../services/bx-product.service";

export enum BitrixEntityType {
    DEAL = 'deal',
    COMPANY = 'company',
    CONTACT = 'contact',
    LEAD = 'lead'
}
@Injectable()
export class CreateDealUseCase {
    constructor(

        private readonly pbx: PBXService


    ) { }
    async init(domain: string) {
        const { bitrix } = await this.pbx.init(domain);
        const bxDealService = new BxDealService();
        const bxFieldsService = new BxFieldsService();
        const bxSmartService = new BxSmartService();
        const bxCompanyService = new BxCompanyService(bitrix);
        const bxProductService = new BxProductService(bitrix);
        await bxDealService.init(bitrix);
        await bxFieldsService.init(bitrix);
        await bxSmartService.init(bitrix);

        return {
            bitrix,
            bxDealService,
            bxFieldsService,
            bxSmartService,
            bxCompanyService,
            bxProductService
        }
    }
    async onDealCreate(data: CreateDealDto) {
        const {
            bitrix,
            bxDealService,
            bxFieldsService,
            bxSmartService,
            bxCompanyService,
            bxProductService
        } = await this.init(data.auth.domain);





        const fields = await bxFieldsService.getDealFields();
        const fieldData = DealFieldHelperService.updateDealDataFromBitrixResponse(fields);
        const bxFieldsIds = DealFieldHelperService.getBxFieldsIdsForSelect(fieldData);


        const testInn = fieldData[BxDealDataKeys.inn]
        console.log('testInn', testInn)


        const deal = await bxDealService.getDeal(data.dealId, bxFieldsIds);
        const dealValues = DealFieldValuesHelperService.getDealValues(deal, fieldData);

        if (deal && deal.ID) {
            const dealId = deal.ID
            const products = await bxProductService.addPpkProducts(dealId, dealValues)
           

        }



        // const testSerachingProductName = (fieldData as DealFieldsTemplate).participants[1].seminar.ppk_program.accountant_gos.list[0].name as string
        // console.log('testSerachingProductName', testSerachingProductName)
        // const test = '«Бухгалтер бюджетной сферы (код А). Нефинансовые активы. Расчёты. Обязательства», 120 часов'
        // const productsResponse = await bitrix.product.getList({
        //     "=active": "Y",
        //     "iblockId": 24,
        //     // '%name': test
        //     // [`%${bxProductData.SEMINAR_TOPIC.bitrixId}`]: testSerachingProductName
        // },
        //     [
        //         "iblockId",
        //         'active',
        //         'name',
        //         'price',
        //         'currencyId',
        //         'id',


        //     ]

        // )
        // const products = productsResponse.result
        // const productsTotal = productsResponse.total

        // console.log('products', products)
        // console.log('productsTotal', productsTotal)

        // await bxSmartService.setParticipantsSmarts(dealValues);
        const inn = dealValues.find(value => value.code === BxDealDataKeys.inn)?.value as string
        console.log('inn', inn)
        deal && deal.ID && await bxDealService.setTimeline(deal.ID, dealValues)
        deal && deal.ID && inn && await bxCompanyService.searchCompany(deal.ID, inn)
        return deal;
    }


    // constructor(
    //     private readonly portalService: PortalContextService,
    //     private readonly bitrixService: BitrixRequestApiService
    // ) { }

    // async createDeal(data: CreateDealDto) {
    //     Logger.log(`Creating deal for domain: ${data.auth.domain}`);
    //     Logger.log(`Creating deal body: ${JSON.stringify(data)}`);
    //     const portal = this.portalService.getPortal();
    //     this.bitrixService.initFromPortal(portal);
    //     const dealRepository = new BxDealRepository(this.bitrixService);
    //     const deal = await dealRepository.getDeal(data.dealId);

    //     Logger.log(`ALFA CONTRACTS Deal: ${JSON.stringify(deal)}`);
    //     return deal;
    // }
}
