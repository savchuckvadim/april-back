
import { CreateActDto } from "../ork-act.dto";
import { BitrixService } from "@/modules/bitrix";
import { PortalModel } from "@/modules/portal/services/portal.model";



export class OrkOnActCreateTaskService {

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel
    ) { }


    async createTask(dto: CreateActDto) {


        const taskData = this.getDataForCreateTask(dto);
        const taskResponse = await this.bitrix.task.add(taskData);
        return taskResponse.result.task;
    }

    private getDataForCreateTask(dto: CreateActDto) {
        const serviceTaskGroup = this.portal.getServiceTaskGroupId();

        return {
            RESPONSIBLE_ID: dto.responsibleId.toString(),
            TITLE: this.getTitle(),
            DESCRIPTION: this.getDescription(dto),
            DEADLINE: dto.deadline,
            GROUP_ID: serviceTaskGroup.toString(),
            PRIORITY: 1,
            UF_CRM_TASK: [`D_${dto.dealId}`, `${dto.smartCrmId}`],


        };
    }
    private getTitle() {
        return `Акт на оказание услуг с поставкой товара `;
    }
    private getDescription(dto: CreateActDto) {
        return `Акт на оказание услуг с поставкой товара
    ${dto.comment}
        `;
    }
}
