import { BitrixService, IBXCompany, IBXContact } from "@/modules/bitrix";
import { EnumTaskEventType } from "../../dto/event-sale-flow/task.dto";
import { EV_TYPE } from "../../types/task-types";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { PortalService } from "@/modules/portal";
import { IPortal } from "@/modules/portal/interfaces/portal.interface";
import { PortalModel } from "@/modules/portal/services/portal.model";
import { EnumEventPlanCode } from "../../types/plan-types";
import { IBXLead } from "@/modules/bitrix/domain/interfaces/bitrix.interface";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export class CreateTaskDto {
    isPriority: boolean;
    type: EnumEventPlanCode;
    stringType: string;
    company?: IBXCompany;
    companyId?: number;
    lead?: IBXLead;
    leadId?: number;
    createdId: number;
    responsibleId: number;
    deadline: string;
    name: string;
    comment: string;
    currentSmartItemId?: number;
    contact?: IBXContact;
    currentDealsItemIds?: number[];
    callingTaskGroupId: number;
    currentTaskId?: number;
    isNeedCompleteOtherTasks: boolean;
    isXO: boolean;
}

export class CreateTaskDataDto {
    fields: CreateTaskDataFieldsDto;
}

export class CreateTaskDataFieldsDto {
    TITLE: string;
    RESPONSIBLE_ID: number;
    GROUP_ID?: number | null;
    CHANGED_BY: number;
    CREATED_BY: number;
    CREATED_DATE: string;
    DEADLINE: string;
    UF_CRM_TASK: string[];
    ALLOW_CHANGE_DEADLINE: string;
    PRIORITY: number;
    UF_TASK_EVENT_COMMENT: string;
    DESCRIPTION?: string;
}
export class TaskBitrixService {
    constructor(
        private readonly bitrix: BitrixService,
        // private readonly portal: PortalModel

    ) { }



    async createTask(dto: CreateTaskDto): Promise<void> {
        const data = await this.getDataForCreateTask(dto);
        await this.bitrix.api.call('tasks.task.add', data);



    }
    async createTaskBatch(cmd: string, dto: CreateTaskDto): Promise<void> {
        const data = await this.getDataForCreateTask(dto);
        this.bitrix.api.addCmdBatch(cmd, 'tasks.task.add', data);
    }
    async getDataForCreateTask(dto: CreateTaskDto): Promise<CreateTaskDataDto> {
        const domain = this.bitrix.api.domain;
        const nowDate = dayjs().tz('Europe/Moscow').format('YYYY-MM-DD HH:mm:ss');



        let contactId: number | null = null;
        let contactName: string | null = null;
        if (dto.contact) {
            if (dto.contact.ID) {
                contactId = Number(dto.contact.ID);
            }
            if (dto.contact.NAME) {
                contactName = dto.contact.NAME;
            }
        }

        // Determine string type based on task type
        let stringType = dto.stringType;
        const typeStr = String(dto.type);
        if (typeStr === EnumEventPlanCode.COLD || typeStr === 'xo') {
            stringType = 'Холодный обзвон ';
        }

        const tasksCrmRelations: string[] = [];

        if (dto.leadId) {
            tasksCrmRelations.push(`L_${dto.leadId}`);
        }
        if (contactId) {
            tasksCrmRelations.push(`C_${contactId}`);
        }




        // Build CRM items array
        let crmItems: string[] = [...tasksCrmRelations];


        // Convert deadline to Moscow time
        const moscowTime = this.getTaskMoscowDeadline(dto.deadline, domain);


        // Build task title
        let taskTitle = `${stringType}  ${dto.name}`;
        if (contactName) {
            taskTitle += `  ${contactName}`;
        }

        // Add deal IDs to CRM items
        if (dto.currentDealsItemIds && dto.currentDealsItemIds.length > 0) {
            for (const dealId of dto.currentDealsItemIds) {
                crmItems.push(`D_${dealId}`);
            }
        }

        // Add company ID to CRM items
        if (dto.companyId) {
            crmItems.push(`CO_${dto.companyId}`);
        }

        // Get company description
        const description = this.getTaskCompanyInfo(domain, dto.company);

        // Build task data
        const taskData: CreateTaskDataDto = {
            fields: {
                TITLE: taskTitle,
                RESPONSIBLE_ID: dto.responsibleId,
                GROUP_ID: dto.callingTaskGroupId,
                CHANGED_BY: dto.createdId, // постановщик
                CREATED_BY: dto.createdId, // постановщик
                CREATED_DATE: nowDate, // дата создания
                DEADLINE: moscowTime, // крайний срок
                UF_CRM_TASK: crmItems,
                ALLOW_CHANGE_DEADLINE: 'Y',
                PRIORITY: dto.isPriority ? 2 : 1,
                UF_TASK_EVENT_COMMENT: dto.comment,
                DESCRIPTION: description,
            },
        };
        const taskIdsForComplete: number[] = [];
        if (dto.currentTaskId) {
            taskIdsForComplete.push(dto.currentTaskId);
        }
        if (dto.isNeedCompleteOtherTasks) {
            if (!taskIdsForComplete.length) {
                this.getCurrentTasksIdsBatchCommands(

                    dto.callingTaskGroupId,
                    crmItems,
                    dto.responsibleId,
                    !dto.isXO, //$isNeedCompleteOnlyTypeTasks
                    dto.stringType,


                );
            }

        }
        if (taskIdsForComplete.length) {
            this.completeTaskBatchCommand(taskIdsForComplete);
        }
        return taskData;
    }

    private getTaskCompanyInfo(domain: string, company?: IBXCompany): string {
        let description = '';
        if (!company) {
            return description;
        }


        let cmpnPhonesEmailsList = '';
        if (company.PHONE) {
            const companyPhones = company.PHONE;
            let cmpnyListContent = '';

            for (const phone of companyPhones) {
                cmpnyListContent += `[*]' .  ${phone?.VALUE ?? ''} . "   "`;
            }


            if (company.EMAIL) {
                const companyEmails = company.EMAIL;
                let cmpnyListContent = '';

                for (const email of companyEmails) {
                    cmpnyListContent += `[*]' .  ${email?.VALUE ?? ''} . "   "`;
                }

                cmpnPhonesEmailsList = '[LIST]' + cmpnyListContent + '[/LIST]';
            }

        }

        const companyTitleString = '[URL=https://' + domain + '/crm/company/details/' + company.ID + '/][B][COLOR=#0070c0] Компания: ' + company.TITLE + ' [/COLOR][/B][/URl]' + "\n" + 'Телефоны: ' + "\n";
        description = companyTitleString;
        description = description + '' + cmpnPhonesEmailsList;

        return description;
    }

    private getTaskMoscowDeadline(deadline: string, domain: string): string {
        // Determine timezone based on domain
        let moscowTime: string = '';
        let timezoneStr: string = 'Europe/Moscow';
        if (domain === 'gsirk.bitrix24.ru') {
            timezoneStr = 'Asia/Irkutsk';
        } else if (domain === 'alfacentr.bitrix24.ru') {
            timezoneStr = 'Asia/Novosibirsk';
        }



        if (domain === 'alfacentr.bitrix24.ru' || domain === 'gsirk.bitrix24.ru') {
            const parsedDate = dayjs(deadline, 'DD.MM.YYYY HH:mm:ss', true);
            if (parsedDate.isValid()) {
                const localTime = parsedDate.tz(timezoneStr);
                moscowTime = localTime.tz('Europe/Moscow').format('YYYY-MM-DD HH:mm:ss');
            }
        } else {
            // If deadline is in DD.MM.YYYY HH:mm:ss format, convert to YYYY-MM-DD HH:mm:ss
            const parsedDate = dayjs(deadline, 'DD.MM.YYYY HH:mm:ss', true);
            if (parsedDate.isValid()) {
                moscowTime = parsedDate.format('YYYY-MM-DD HH:mm:ss');
            }
        }
        return moscowTime
    }

    private getCurrentTasksIdsBatchCommands(

        callingTaskGroupId: number,
        crmItems: string[],
        responsibleId: number,
        isNeedCompleteOnlyTypeTasks: boolean,
        stringType: string,

    ): void {

        const filter = {
            GROUP_ID: callingTaskGroupId,
            UF_CRM_TASK: crmItems,
            RESPONSIBLE_ID: responsibleId,
        }
        if (isNeedCompleteOnlyTypeTasks) {
            filter['%TITLE'] = stringType;
        }
        const batchKey = 'get_tasks_list'
        this.bitrix.api.addCmdBatch(batchKey, 'tasks.task.list', {
            filter,
        });
    }


    public completeTaskBatchCommand(taskIds: number[]): void {
        const methodUpdate = 'tasks.task.update';
        const methodComplete = 'tasks.task.complete';



        for (const taskId of taskIds) {
            const updateTaskBathKey = `updateTask_${taskId}`;
            const completeTaskBathKey = `completeTask_${taskId}`;
            this.bitrix.api.addCmdBatch(updateTaskBathKey, methodUpdate, {
                taskId: taskId,
                fields: {
                    MARK: 'P',
                },
            });
            this.bitrix.api.addCmdBatch(completeTaskBathKey, methodComplete, {
                taskId: taskId,
            });

        }



    }





    async updateTaskCrmRelations(taskId: number,
        leadId?: number,
        contactIds?: number[],
        companyId?: number,
        dealIds?: number[],
    ): Promise<void> {
        let crmRelations: string[] = [];
        if (leadId) {
            crmRelations.push(`L_${leadId}`);
        }
        if (contactIds) {
            for (const contactId of contactIds) {
                crmRelations.push(`C_${contactId}`);
            }
        }
        if (companyId) {
            crmRelations.push(`CO_${companyId}`);
        }
        if (dealIds) {
            for (const dealId of dealIds) {
                crmRelations.push(`D_${dealId}`);
            }
        }
        await this.bitrix.api.call('crm.task.update', {
            taskId: taskId,
            fields: {
                UF_CRM_TASK: crmRelations,
            },
        });
    }






    async changeCurrentTaskDeadline(domain: string, taskId: number, deadline: string, isBatch: boolean = false): Promise<void> {
        const moscowTime = this.getTaskMoscowDeadline(deadline, domain);
        const data = {
            taskId: taskId,
            fields: {
                DEADLINE: moscowTime,
                ALLOW_CHANGE_DEADLINE: 'Y'
            },
        }
        if (isBatch) {
            const batchKey = `changeCurrentTaskDeadline_${taskId}`;
            this.bitrix.api.addCmdBatch(batchKey, 'tasks.task.update', data);
        } else {
            await this.bitrix.api.call('tasks.task.update', data);
        }
    }

}
