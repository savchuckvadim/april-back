import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Logger } from '@nestjs/common';
import { ColdHookBatchGroupBuffer } from '../../batch/cold-hook-batch-group-buffer';
import { PortalDeadline } from '@lib/shared/lib/date';

export interface IColdTaskFlow {
    deadline: PortalDeadline;
    name: string;
    responsibleId: number;
    companyId: number;
    baseDealId: string;
    xoDealId: string;
}
export class ColdTaskFlowService {
    private readonly logger = new Logger(ColdTaskFlowService.name);
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    public createNextTask(
        data: IColdTaskFlow,
        buffer: ColdHookBatchGroupBuffer,
    ) {
        const {
            companyId,
            baseDealId,
            xoDealId,
            deadline,
            responsibleId,
            name,
        } = data;
        const addColdTaskKey = `bx_task_add_${companyId}`;
        const tasksGroupId = this.portal.getSalesTaskGroupId();
        this.logger.log(`Tasks group id: ${tasksGroupId}`);
        const ufCrms = this.getUfCrms(companyId, baseDealId, xoDealId);
        const taskDeadline = deadline.toTaskDeadline();
        this.logger.log(
            `[deadline][task] company=${companyId} DEADLINE="${taskDeadline}" ` +
                `(server-time Москва) debug=${JSON.stringify(deadline.debug())}`,
        );
        const addColdTaskData = {
            RESPONSIBLE_ID: responsibleId,
            TITLE: name,
            DEADLINE: taskDeadline,
            UF_CRM_TASK: ufCrms,
            GROUP_ID: tasksGroupId,
        };
        this.logger.log(
            `[DEADLINE][task][SEND] company=${companyId} cmdKey=${addColdTaskKey} ` +
                `tasks.task.add DEADLINE="${taskDeadline}" (Москва) ` +
                `payload=${JSON.stringify(addColdTaskData)}`,
        );
        buffer.queue(() =>
            this.bitrix.batch.task.add(addColdTaskKey, addColdTaskData),
        );
    }

    private getUfCrms(
        companyId: number,
        baseDealId: string,
        xoDealId: string,
    ): string[] {
        const crms: string[] = [];
        crms.push(`CO_${companyId}`);
        crms.push(`D_${baseDealId}`);
        crms.push(`D_${xoDealId}`);
        return crms;
    }
}
