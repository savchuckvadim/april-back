import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskService {
    async initTaskAccountant(data: any, portal: any): Promise<number> {
        const bxRpa = this.getBxRpa(data.auth.domain, portal.accessKey);
        const rpa = await bxRpa.getRpa(
            data.document_id.type_id,
            data.document_id.rpa_id,
        );
        const bxTask = this.getBxTask(data.auth.domain, portal.accessKey);

        const dateFormat = '%Y-%m-%dT%H:%M:%S%z';

        rpa.CONTRACT_START = this.formatDate(rpa.CONTRACT_START, dateFormat);
        const firstPayDay = this.formatDate(rpa.FIRST_PAY_DATE, dateFormat);
        rpa.CONTRACT_END = this.formatDate(rpa.CONTRACT_END, dateFormat);

        const supplyDate = this.formatDate(rpa.SUPPLY_DATE, dateFormat, true);

        const field = {
            TITLE: rpa.NAME,
            DESCRIPTION: `Действие договора с ${rpa.CONTRACT_START} до ${rpa.CONTRACT_END}\nДата поставки: ${supplyDate}\nДата первой оплаты: ${firstPayDay}\n\nссылка на RPA: <a href="https://${data.auth.domain}/rpa/item/${data.document_id.type_id}/${data.document_id.rpa_id}/">Заявка на поставку</a>`,
            DEADLINE: rpa.SUPPLY_DATE,
            UF_CRM_TASK: [`CO_${rpa.RPA_CRM_COMPANY}`],
            RESPONSIBLE_ID: this.findResponsibleId(rpa),
        };

        const task = await bxTask.create(field);
        const textTimelineRpa = `<a href='https://${data.auth.domain}/company/personal/user/${task.responsibleId}/tasks/task/view/${task.id}/'>Задача для бухгалтера</a>`;
        await bxRpa.addTimeline(
            textTimelineRpa,
            data.document_id.type_id,
            data.document_id.rpa_id,
        );

        return task.id;
    }

    async initTaskManagerOrkFirstEducation(
        portal: any,
        domain: string,
        rpa: any,
        dealServiceId: number,
    ): Promise<number> {
        const bxTask = this.getBxTask(domain, portal.accessKey);

        rpa.SUPPLY_DATE = this.adjustSupplyDate(rpa.SUPPLY_DATE);

        const field = {
            TITLE: `Первичное обучение: ${rpa.name}`,
            DESCRIPTION: `Описание ситуации: ${rpa.SITUATION_COMMENTS}\n\nКомментарий к заявке Руководитель: \n${rpa.RPA_OWNER_COMMENT.join('\n')}\n\nКомментарий к заявке РОП: \n${rpa.RPA_TMC_COMMENT.join('\n')}\n\n`,
            DEADLINE: rpa.CLIENT_CALL_DATE,
            UF_CRM_TASK: [`CO_${rpa.RPA_CRM_COMPANY}`, `D_${dealServiceId}`],
            RESPONSIBLE_ID: rpa.MANAGER_OS,
        };

        const task = await bxTask.create(field);
        return task.id;
    }

    async initTaskManagerOrkSupply(
        portal: any,
        domain: string,
        rpa: any,
        dealServiceId: number,
    ): Promise<number> {
        const bxTask = this.getBxTask(domain, portal.accessKey);

        rpa.SUPPLY_DATE = this.adjustSupplyDate(rpa.SUPPLY_DATE);

        const field = {
            TITLE: rpa.name,
            DESCRIPTION: `Описание ситуации: ${rpa.SITUATION_COMMENTS}\n\nКомментарий к заявке Руководитель: \n${rpa.RPA_OWNER_COMMENT.join('\n')}\n\nКомментарий к заявке РОП: \n${rpa.RPA_TMC_COMMENT.join('\n')}\n\n`,
            DEADLINE: rpa.SUPPLY_DATE,
            UF_CRM_TASK: [`CO_${rpa.RPA_CRM_COMPANY}`, `D_${dealServiceId}`],
            RESPONSIBLE_ID: rpa.MANAGER_OS,
        };

        const task = await bxTask.create(field);
        return task.id;
    }

    private formatDate(
        dateStr: string,
        format: string,
        adjustTime: boolean = false,
    ): string {
        const dateObj = new Date(dateStr);
        if (adjustTime) {
            dateObj.setHours(8, 0, 0, 0);
        }
        return dateObj.toISOString().split('T')[0];
    }

    private adjustSupplyDate(supplyDate: string): string {
        const dateObj = new Date(supplyDate);
        if (dateObj.getHours() === 0) {
            dateObj.setHours(11);
        }
        return dateObj.toISOString().split('T')[0];
    }

    private findResponsibleId(rpa: any): number {
        for (const user of rpa.users) {
            if (
                user.workPosition &&
                user.workPosition.toLowerCase().includes('бухгалтер')
            ) {
                return user.id;
            }
        }
        return rpa.updatedBy;
    }

    private getBxTask(domain: string, accessKey: string): any {
        // Simulate BxTask service
        return {
            create: async (field: any) => ({
                id: 1,
                responsibleId: field.RESPONSIBLE_ID,
            }),
        };
    }

    private getBxRpa(domain: string, accessKey: string): any {
        // Simulate BxRpa service
        return {
            getRpa: async (typeId: number, rpaId: number) => ({}),
            addTimeline: async (
                text: string,
                typeId: number,
                itemId: number,
            ) => {},
        };
    }
}
