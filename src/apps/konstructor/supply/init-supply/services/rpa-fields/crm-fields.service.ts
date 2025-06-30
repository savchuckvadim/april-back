import { Injectable } from "@nestjs/common";
import { InitSupplyDto } from "../../dto/init-supply.dto";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { IBxRpaItem } from "@/modules/bitrix";

@Injectable()
export class InitSupplyRpaCrmFieldsService {
   


   

    public get(dto: InitSupplyDto, PortalModel: PortalModel) {
        const companyFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', 'rpa_crm_company')
        const baseDealFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', 'rpa_crm_base_deal')
        const managerOpFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', 'manager_op')
        const managerOsFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', 'manager_os')
        const contactsFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', 'rpa_crm_contacts')
        //TODO: добавить поле service_smart_id
        const serviceSmartIdFieldBitrixId = PortalModel.getRpaFieldBitrixIdByCode('supply', 'service_offer_smart')
        return {
            [`${companyFieldBitrixId}`]: dto.companyId,
            [`${baseDealFieldBitrixId}`]: dto.dealId,
            [`${managerOpFieldBitrixId}`]: dto.userId,
            [`${managerOsFieldBitrixId}`]: dto.userId,
            [`${contactsFieldBitrixId}`]: dto.bxContacts.map(contact => contact.ID),
            [`${serviceSmartIdFieldBitrixId}`]: dto.serviceSmartId
        } as Partial<IBxRpaItem>
    }

}