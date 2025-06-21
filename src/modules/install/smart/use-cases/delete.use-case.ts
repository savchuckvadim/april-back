import { Injectable } from "@nestjs/common";
import { PortalSmartService } from "../services/portal-smart.service";
import { SmartGroupEnum, SmartNameEnum } from "../dto/install-smart.dto";

@Injectable()
export class DeleteSmartUseCase {
    constructor(

        private readonly portalSmartService: PortalSmartService
      
    ) { }

    async execute(smartName: SmartNameEnum, domain: string, smartGroup: SmartGroupEnum) {
     
        //todo delete in bitrix:
        // 1. get smart from db
        // 2. search and delete in bitrix by bitrixId from db
        // 3. delete from db: is done in deleteSmartByPortalAndName
       return await this.portalSmartService.deleteSmartByPortalAndName(domain, smartName, smartGroup);
    }
}