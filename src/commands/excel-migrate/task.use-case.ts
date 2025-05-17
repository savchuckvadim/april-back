import { BitrixApiFactoryService } from "src/modules/bitrix/core/queue/bitrix-api.factory.service";
import { Injectable } from "@nestjs/common";
import { PortalService } from "src/modules/portal/portal.service";
import { PortalModel } from "src/modules/portal/services/portal.model";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BxTasksRepository } from "src/modules/bitrix/domain/tasks/bx-tasks.repository";


@Injectable()
export class TaskUseCase {
    private bitrixApi: BitrixBaseApi
    private portal: PortalModel
    constructor(
        private readonly bitrixApiFactory: BitrixApiFactoryService,
        private readonly portalService: PortalService,

    ) { }

    async getTasks(domain: string) {
        this.portal = await this.portalService.getModelByDomain(domain);
        this.bitrixApi = this.bitrixApiFactory.create(this.portal.getPortal());
        const taskRepo = new BxTasksRepository(this.bitrixApi)
        const result = await taskRepo.getAll({
            CREATED_BY: '187'
        }, ['ID', 'TITLE', 'CREATED_BY'])
        const tasks = result.tasks
        const deleteResults = []

        for (const task of tasks) {
            if (task.id == 108644) {
                taskRepo.updateBtch(
                    `delete_task_${task.id}`,
                    task.id,
                    {
                        CREATED_BY: '1'
                    }
                )

            }
        }
        const cmds = this.bitrixApi.getCmdBatch();
        const btchResult = this.bitrixApi.callBatchWithConcurrency(2);
        return { result, deleteResults, cmds, btchResult }
    }
}
