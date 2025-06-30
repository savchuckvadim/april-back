
import { AlfaMigrateBitrixAbstract } from "./alfa-migrate-bitrix-abstract.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class AlfaMigrateBitrixCompanyService extends AlfaMigrateBitrixAbstract {

    getCompanyCommand(element: any, companyCommandCode: string) {
        const name = element.company
        const title = name ? name.replace(/[\r\n]+/g, ' ') : ''
       
    
        this.bitrix.batch.company.set(
            companyCommandCode,

            {

                ASSIGNED_BY_ID: this.userId,
                TITLE: title,
                UF_CRM_USER_CARDNUM: element.id as string,
                COMMENTS: element.company,


            }
        )

    }



}
