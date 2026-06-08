import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Logger } from '@nestjs/common';
import { ColdHookBatchGroupBuffer } from '../../batch/cold-hook-batch-group-buffer';
import { toTaskDeadline } from '@/shared/lib/date';

export interface IColdTaskFlow {
    deadline: string;
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
        const taskDeadline = toTaskDeadline(
            deadline,
            this.portal.getTimezone(),
        );
        const addColdTaskData = {
            RESPONSIBLE_ID: responsibleId,
            TITLE: name,
            DEADLINE: taskDeadline,
            UF_CRM_TASK: ufCrms,
            GROUP_ID: tasksGroupId,
        };
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
