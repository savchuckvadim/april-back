import { Injectable } from "@nestjs/common";
import { InitSupplyDto } from "../../dto/init-supply.dto";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { IBxRpaItem } from "@/modules/bitrix";
import { InitSupplyFileService } from "../file/init-supply-file.service";



@Injectable()
export class InitSupplyRpaSupplyReportFileFieldService {
    constructor(
            private readonly initSupplyFileService: InitSupplyFileService
    ) { }

    
    public async get(dto: InitSupplyDto, PortalModel: PortalModel) {
        const currentSupplyReportBxFieldData = await this.initSupplyFileService.downloadFileAndConvertToBase64(dto.file)
        const rpaCurrentSupplyReportField = PortalModel.getRpaFieldBitrixIdByCode('supply', 'current_supply')

        const rpaFields = {
            [`${rpaCurrentSupplyReportField}`]: currentSupplyReportBxFieldData,


        } as Partial<IBxRpaItem>

        return rpaFields;
    }







}