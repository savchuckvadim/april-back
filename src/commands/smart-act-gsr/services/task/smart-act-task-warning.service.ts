import { BitrixService } from '@/modules/bitrix';
import type { IBXTaskCreateFields } from '@/modules/bitrix/domain/tasks/task';
import {
    SMART_ACT_PLAN_WARNINGS,
    TASK_DEADLINE,
    TASK_PRIORITY,
    type ISmartActWarningTaskSendData,
    type SmartActPlanWarningKind,
} from './smart-act-plan-warning.constants';

export type {
    ISmartActWarningTaskSendData,
    SmartActPlanWarningKind,
} from './smart-act-plan-warning.constants';

export class SmartActWarningTaskService {
    constructor(private readonly bitrix: BitrixService) {}

    public async sendTasks(
        tasksData: ISmartActWarningTaskSendData[],
    ): Promise<void> {
        if (tasksData.length === 0) {
            return;
        }
        for (const taskData of tasksData) {
            this.getTaskBatchCommand(taskData);
        }
        await this.bitrix.api.callBatchWithConcurrency(1);
    }

    private getTaskBatchCommand(taskData: ISmartActWarningTaskSendData): void {
        const { type, dealId, companyId, responsibleId } = taskData;
        const batchKey = `smart_act_warning_task_${type}_${dealId}`;
        const taskSendData = this.getTaskSendData(
            type,
            dealId,
            companyId,
            responsibleId,
        );
        console.log(taskSendData);
        this.bitrix.batch.task.add(batchKey, taskSendData);
    }

    private getTaskSendData(
        type: SmartActPlanWarningKind,
        dealId: number,
        companyId: number,
        responsibleId: number,
    ): IBXTaskCreateFields {
        const ufCrm: string[] = [`D_${dealId}`];
        if (companyId > 0) {
            ufCrm.unshift(`CO_${companyId}`);
        }
        return {
            TITLE: SMART_ACT_PLAN_WARNINGS[type].title,
            DESCRIPTION: SMART_ACT_PLAN_WARNINGS[type].description,
            RESPONSIBLE_ID: responsibleId,
            PRIORITY: TASK_PRIORITY,
            DEADLINE: TASK_DEADLINE,
            UF_CRM_TASK: ufCrm,
        } as unknown as IBXTaskCreateFields;
    }
}
