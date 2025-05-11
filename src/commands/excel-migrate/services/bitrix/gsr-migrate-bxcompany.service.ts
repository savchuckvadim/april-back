import { EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix/core";

import { MigrateToBxDto } from "../../dto/migrate-to-bx.dto";
import { GsrMigrateBitrixAbstract } from "./gsr-migrate-bitrix-abstract.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class GsrMigrateBitrixCompanyService extends GsrMigrateBitrixAbstract {




    getCompanyCommand(element: MigrateToBxDto, companyCommandCode: string) {
        this.bitrixApi.addCmdBatchType(
            companyCommandCode,
            EBxNamespace.CRM,
            EBXEntity.COMPANY,
            EBxMethod.ADD,
            {
                fields: {
                    ASSIGNED_BY_ID: "221",
                    TITLE: element.company,
                    UF_CRM_USER_CARDNUM: element.id as string,
                }

            }
        )

    }



}
