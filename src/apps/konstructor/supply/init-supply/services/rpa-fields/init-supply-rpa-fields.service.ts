import { Injectable } from "@nestjs/common";

import { InitSupplyDto } from "../../dto/init-supply.dto";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { IBxRpaItem } from "@/modules/bitrix";
import { InitSupplyRpaPbxItemsFieldsService } from "./pbx-items-fields.service";
import { InitSupplyRpaSupplyReportFieldsService } from "./supply-report-fields.service";
import { InitSupplyRpaRqFieldsService } from "./rq-fields.service";
import { InitSupplyRpaCrmFieldsService } from "./crm-fields.service";
import { InitSupplyRpaSupplyReportFileFieldService } from "./supply-report-file-field.service";


@Injectable()
export class InitSupplyRpaFieldsService {
    constructor(
        private readonly initSupplyRpaPbxItemsFieldsService: InitSupplyRpaPbxItemsFieldsService,
        private readonly initSupplyRpaSupplyReportFieldsService: InitSupplyRpaSupplyReportFieldsService,
        private readonly initSupplyRpaRqFieldsService: InitSupplyRpaRqFieldsService,
        private readonly initSupplyRpaCrmFieldsService: InitSupplyRpaCrmFieldsService,
        private readonly initSupplyRpaSupplyReportFileFieldService: InitSupplyRpaSupplyReportFileFieldService
    ) { }
    public async getRpaFields(dto: InitSupplyDto, PortalModel: PortalModel) {



        const rpaNameField = PortalModel.getRpaFieldBitrixIdByCode('supply', 'name')
        const rpaExtensionField = PortalModel.getRpaFieldBitrixIdByCode('supply', 'is_extension')
        const rpaCurrentSupplyReportValues = await this.initSupplyRpaSupplyReportFileFieldService.get(dto, PortalModel)
        const bxCompanyItemsRpaValues = await this.initSupplyRpaPbxItemsFieldsService.get(dto, PortalModel)
        const bxDealItemsRpaValues = await this.initSupplyRpaPbxItemsFieldsService.get(dto, PortalModel)
        const supplyReportRpaValues = await this.initSupplyRpaSupplyReportFieldsService.get(dto, PortalModel)
        const bxrqValues = await this.initSupplyRpaRqFieldsService.get(dto, PortalModel)
        const crmRelationsRpaValues = this.initSupplyRpaCrmFieldsService.get(dto, PortalModel)


        const rpaFields = {
            [`${rpaNameField}`]: `Перезаключение ${dto.companyName}`,
            [`${rpaExtensionField}`]: true,
            ...rpaCurrentSupplyReportValues,

            // [`${rpaCommentField}`]: '🎯 Перезаключение ТЕСТ',
            ...bxCompanyItemsRpaValues,
            ...bxDealItemsRpaValues,
            ...supplyReportRpaValues,
            ...bxrqValues,
            ...crmRelationsRpaValues


        } as Partial<IBxRpaItem>


        return rpaFields;
    }



}