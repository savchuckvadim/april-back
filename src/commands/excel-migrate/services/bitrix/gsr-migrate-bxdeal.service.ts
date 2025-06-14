import { EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix/core";

import { MigrateToBxDto } from "../../dto/migrate-to-bx.dto";

import { GsrMigrateBitrixAbstract } from "./gsr-migrate-bitrix-abstract.service";

import { Injectable } from "@nestjs/common";
@Injectable()
export class GsrMigrateBitrixDealService extends GsrMigrateBitrixAbstract {




    getDealCommand(element: MigrateToBxDto, companyCommandCode: string, dealCommandCode: string, contactCommands: string[]) {
        const pDealCategory = this.portal.getDealCategoryByCode('service_base')
        const dealComment = this.getDealComment(element)
        const pDealContractEndField = this.portal.getDealFieldBitrixIdByCode('ork_current_contract_fin_date')
        const pDealSupplyDateField = this.portal.getDealFieldBitrixIdByCode('supply_date')
        const pDealContractEndField2 = this.portal.getDealFieldBitrixIdByCode('contract_end')
        const pDealContractTypeField = this.portal.getDealFieldBitrixIdByCode('contract_type')

        const armIds = element.products.map(p => p.armId)
        const name = element.company
        let title = name ? name.replace(/[\r\n]+/g, ' ') : ''
        title = title ? title.slice(0, 79) : ''
        this.bitrix.batch.deal.set(
            dealCommandCode,
            {


                ASSIGNED_BY_ID: this.userId,
                COMPANY_ID: `$result[${companyCommandCode}]`,
                // // @ts-ignore
                // CONTACT_IDS: contactCommands.map(cmd => `$result[${cmd}]`),
                TITLE: title,
                COMMENTS: dealComment,
                CATEGORY_ID: pDealCategory?.bitrixId || '',
                STAGE_ID: pDealCategory?.stages[0].bitrixId || '',
                [pDealContractEndField]: element.contract.contractEndDate,
                [pDealSupplyDateField]: element.supplyDate,
                [pDealContractEndField2]: element.contract.contractEndDate,
                [pDealContractTypeField]: element.contract.contractType,
                UF_CRM_RPA_ARM_COMPLECT_ID: armIds,





            }
        )
    }

    getDealUpdateCommand(contactCommands: string[], dealCommandCode: string) {

        const contactIds = contactCommands.map(cmd => `$result[${cmd}]`)
        console.log('getDealUpdateCommand')
        console.log(contactIds)
        this.bitrix.batch.deal.contactItemsSet(
            `${dealCommandCode}_updt_to_contacts`,
            `$result[${dealCommandCode}]`,
            contactIds
        )
    }

    private getDealComment(element: MigrateToBxDto) {

        const comment = ' <br><b>Информация об оплате</b> ' + element.payinfo + '   </br> ' +
            ' <br><b>Комплект/Сервисы</b> ' + element.complectInfo + '   </br>  ' +
            ' <br><b>Информация о документах</b> ' + element.document + '   </br>  ' +
            ' <br><b>Конкурент</b> ' + element.concurent + '   </br> '

        return comment

    }
}
