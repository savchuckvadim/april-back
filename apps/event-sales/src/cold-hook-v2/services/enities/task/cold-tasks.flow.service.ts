import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { Logger } from '@nestjs/common';
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../../../shared/batch';
import { BitrixDateTime } from '@lib/shared/lib/date';
import { ColdOwner, ownerKey } from '../cold-owner.type';

export interface IColdTaskFlow {
    deadline: BitrixDateTime;
    name: string;
    responsibleId: number;
    owner: ColdOwner;
    baseDealId: string;
    xoDealId: string;
}
const EVENT_TYPE_NAME = 'Холодный обзвон';

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
        const { owner, baseDealId, xoDealId, deadline, responsibleId, name } =
            data;
        const key = ownerKey(owner);
        const addColdTaskKey = `bx_task_add_${key}`;
        const tasksGroupId = this.portal.getSalesTaskGroupId();
        this.logger.log(`Tasks group id: ${tasksGroupId}`);
        const ufCrms = this.getUfCrms(owner, baseDealId, xoDealId);
        const taskDeadline = deadline.toTaskDeadline();
        this.logger.log(
            `[deadline][task] owner=${key} DEADLINE="${taskDeadline}" ` +
                `(server-time Москва) debug=${JSON.stringify(deadline.debug())}`,
        );
        const fullXoName = `${EVENT_TYPE_NAME} ${name}`;
        const addColdTaskData = {
            RESPONSIBLE_ID: responsibleId,
            TITLE: fullXoName,
            DEADLINE: taskDeadline,
            UF_CRM_TASK: ufCrms,
            GROUP_ID: tasksGroupId,
        };
        this.logger.log(
            `[DEADLINE][task][SEND] owner=${key} cmdKey=${addColdTaskKey} ` +
                `tasks.task.add DEADLINE="${taskDeadline}" (Москва) ` +
                `payload=${JSON.stringify(addColdTaskData)}`,
        );
        buffer.queue(() =>
            this.bitrix.batch.task.add(addColdTaskKey, addColdTaskData),
        );
    }

    /**
     * Привязки задачи: компания (если есть), основная и ХО-сделки; у клиента
     * без компании — ещё лид входной сделки, чтобы задача находилась по `L_`.
     */
    private getUfCrms(
        owner: ColdOwner,
        baseDealId: string,
        xoDealId: string,
    ): string[] {
        const crms: string[] = [];
        if (owner.kind === 'company') crms.push(`CO_${owner.companyId}`);
        crms.push(`D_${baseDealId}`);
        crms.push(`D_${xoDealId}`);
        if (owner.kind === 'deal' && owner.leadId) crms.push(`L_${owner.leadId}`);
        return crms;
    }
}
