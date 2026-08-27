import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import type { IBXTaskCreateFields } from '@lib/bitrix/domain/tasks/task';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { OrkSupplyTaskJobDto } from '../dto/ork-supply-task.dto';

/** Коды полей RPA «Поставка», из которых собираются задачи ОРК. */
const RPA_FIELD = {
    company: 'rpa_crm_company',
    managerOs: 'manager_os',
    situation: 'situation_comments',
    ownerComment: 'rpa_owner_comment',
    tmcComment: 'rpa_tmc_comment',
    clientCallDate: 'client_call_date',
    supplyDate: 'supply_date',
} as const;

type TaskAddResponse = { result?: { task?: { id?: number | string } } };

@Injectable()
export class OrkSupplyTaskService {
    private readonly logger = new Logger(OrkSupplyTaskService.name);

    constructor(private readonly pbx: PBXService) {}

    /**
     * Две задачи менеджеру ОРК на момент перехода поставки в отдел сервиса:
     * «Первичное обучение» (дедлайн — дата звонка клиенту) и «Поставка»
     * (дедлайн — дата поставки). Обе привязываются к компании и к новой
     * сервисной сделке.
     */
    async createSupplyTasks(job: OrkSupplyTaskJobDto): Promise<number[]> {
        const { bitrix, PortalModel: portalModel } = await this.pbx.init(
            job.domain,
        );

        const rpaResponse = await bitrix.rpaItem.get({
            typeId: job.rpaTypeId,
            id: job.rpaId,
        });
        const rpa = rpaResponse.result.item;
        if (!rpa) {
            this.logger.warn(
                `RPA ${job.rpaTypeId}:${job.rpaId} не найдена — задачи ОРК не созданы`,
            );
            return [];
        }

        const rpaValue = (code: string): unknown =>
            this.getRpaValue(rpa, portalModel, code);

        const responsibleId = this.toId(rpaValue(RPA_FIELD.managerOs));
        if (!responsibleId) {
            this.logger.warn(
                `RPA ${job.rpaTypeId}:${job.rpaId}: не заполнен менеджер ОС — задачи ОРК не созданы`,
            );
            return [];
        }

        const crmLinks: string[] = [`D_${job.dealId}`];
        const companyId = this.toId(rpaValue(RPA_FIELD.company));
        if (companyId) {
            crmLinks.unshift(`CO_${companyId}`);
        }

        const description = this.buildDescription(
            this.toText(rpaValue(RPA_FIELD.situation)),
            this.toText(rpaValue(RPA_FIELD.ownerComment)),
            this.toText(rpaValue(RPA_FIELD.tmcComment)),
        );
        const rpaName = this.toText(rpa.name) || 'Поставка';

        const tasks: IBXTaskCreateFields[] = [
            {
                TITLE: `Первичное обучение: ${rpaName}`,
                RESPONSIBLE_ID: responsibleId,
                DESCRIPTION: description,
                DEADLINE: this.withDefaultHour(
                    this.toText(rpaValue(RPA_FIELD.clientCallDate)),
                ),
                UF_CRM_TASK: crmLinks,
            },
            {
                TITLE: rpaName,
                RESPONSIBLE_ID: responsibleId,
                DESCRIPTION: description,
                DEADLINE: this.withDefaultHour(
                    this.toText(rpaValue(RPA_FIELD.supplyDate)),
                ),
                UF_CRM_TASK: crmLinks,
            },
        ];

        const created: number[] = [];
        for (const fields of tasks) {
            const response = (await bitrix.task.add(
                fields,
            )) as TaskAddResponse;
            const taskId = Number(response?.result?.task?.id);
            if (taskId) {
                created.push(taskId);
            } else {
                this.logger.warn(
                    `Задача ОРК «${fields.TITLE}» создана без id в ответе`,
                );
            }
        }

        this.logger.log(
            `RPA ${job.rpaTypeId}:${job.rpaId} → задачи ОРК: ${created.join(', ') || 'нет'}`,
        );
        return created;
    }

    private getRpaValue(
        rpa: Record<string, unknown>,
        portalModel: PortalModel,
        code: string,
    ): unknown {
        const fieldName = portalModel.getRpaFieldBitrixIdByCode('supply', code);
        return fieldName ? rpa[fieldName] : undefined;
    }

    /**
     * Дата без времени приходит как `...T00:00:00+03:00`. Легаси ставил в таком
     * случае 11:00 — правим строку, не трогая смещение, чтобы не уехать на
     * часовой пояс сервера.
     */
    private withDefaultHour(raw: string): string | undefined {
        if (!raw) {
            return undefined;
        }
        return raw.replace('T00:00:00', 'T11:00:00');
    }

    private buildDescription(
        situation: string,
        ownerComment: string,
        tmcComment: string,
    ): string {
        return [
            `Описание ситуации: ${situation}`,
            '',
            'Комментарий к заявке Руководитель:',
            ownerComment,
            '',
            'Комментарий к заявке РОП:',
            tmcComment,
        ].join('\n');
    }

    /** Поля-комментарии в RPA множественные — склеиваем в текст. */
    private toText(value: unknown): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (Array.isArray(value)) {
            return value.map(item => this.toText(item)).join('\n');
        }
        return String(value);
    }

    private toId(value: unknown): number | undefined {
        const id = Number(Array.isArray(value) ? value[0] : value);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }
}
