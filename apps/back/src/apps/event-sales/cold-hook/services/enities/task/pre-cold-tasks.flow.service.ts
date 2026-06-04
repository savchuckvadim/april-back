import { prepareBatchResults } from '@/apps/event-sales/shared';
import { BitrixService } from '@/modules/bitrix';
import { EBXTaskStatus, IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { PortalModel } from '@lib/portal/services/portal.model';
import { Logger } from '@nestjs/common';

export class PreColdTasksFlowService {
    private readonly logger = new Logger(PreColdTasksFlowService.name);
    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
    ) {}

    public async closeTasks(companiesIds: number[]) {
        const tasksGroupId = this.portal.getSalesTaskGroupId();
        this.logger.log(`Tasks group id: ${tasksGroupId}`);

        // const tasksResponse = await this.bitrix.task.getAll({
        //     GROUP_ID: tasksGroupId,

        // }, ["ID", "TITLE", "RESPONSIBLE_ID"])
        for (const companyId of companiesIds) {
            const ufCrm = `CO_${companyId}`;
            this.bitrix.batch.task.getList(
                `bx_task_get_list_${ufCrm}`,
                {
                    GROUP_ID: tasksGroupId,
                    UF_CRM_TASK: [ufCrm],
                    '!STATUS': EBXTaskStatus.COMPLETED,
                },
                [
                    'ID',
                    'TITLE',
                    'RESPONSIBLE_ID',
                    'UF_CRM_TASK',
                    'STATUS',
                    'COMPLETED',
                ],
            );
        }
        const getTasksBatchResponse =
            await this.bitrix.api.callBatchWithConcurrency(1);
        const tasksData = prepareBatchResults<{ tasks: IBXTask[] }>(
            getTasksBatchResponse,
        );
        const tasks = tasksData.flatMap(tasks => tasks.tasks);
        this.logger.log(`Tasks found: ${tasks.length}`);
        this.logger.log(`Tasks: ${JSON.stringify(tasks)}`);

        for (const task of tasks) {
            this.bitrix.batch.task.complete(
                `bx_task_complete_${task.id}`,
                task.id,
            );
        }

        const completedTaskResponse =
            await this.bitrix.api.callBatchWithConcurrency(2);
        const resultTasks = prepareBatchResults<{ task: IBXTask }>(
            completedTaskResponse,
        );

        const result = resultTasks.map(it => it.task);
        this.logger.log(`Completed tasks: ${result.length}`);
        this.logger.log(`Completed tasks: ${JSON.stringify(result)}`);
        return result;
    }
}
