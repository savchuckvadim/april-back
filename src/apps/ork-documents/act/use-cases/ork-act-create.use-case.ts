import { Injectable } from "@nestjs/common";
import { CreateActDto } from "../ork-act.dto";
import { PBXService } from "@/modules/pbx";
import { BitrixService } from "@/modules/bitrix";

import { OrkOnActCreateTaskService } from "../services/task.service";
import { OrkOnActCreateProductRowService } from "../services/product-row.service";

// const ACT_SMART_TYPE_ID = `1044`;
// const SMART_GENERAL_CATEGORY_ID = 21;
@Injectable()
export class OrkOnActCreateUseCase {

    constructor(
        private readonly pbx: PBXService,


    ) { }


    async createAct(dto: CreateActDto) {
        const result = true;
        const { bitrix, portal, PortalModel } = await this.pbx.init(dto.domain);


        const productRowService = new OrkOnActCreateProductRowService(bitrix);
        void await productRowService.migrateRowsFromDealToSmart(dto);

        if (!dto.deadline || !dto.responsibleId) {
            return { result };
        }




        const taskService = new OrkOnActCreateTaskService(bitrix, PortalModel);

        void await taskService.createTask(dto);


        return { result};
    }



}
