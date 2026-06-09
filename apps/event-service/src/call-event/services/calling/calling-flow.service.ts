import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBXListItemFields } from '@/modules/bitrix/domain/list-item/interface/bx-list-item.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EnumOrkEventAction,
    EnumOrkEventCommunication,
    EnumOrkEventInitiative,
    EnumOrkResultStatus,
} from '@lib/portal-lib/pbx/pbx-ork-history-bx-list';
import { CallEventContext } from '../context/call-event.context';
import { OrkFieldResolver } from '../ork/ork-field.resolver';
import {
    OrkHistoryElementBuilder,
    IOrkHistoryElementParams,
} from '../history/ork-history-element.builder';
import { formatCrmDateTime } from '../smart/utils/date.util';
import { normalizeCallingEventType } from '../../types/calling-event.enum';

/** Соответствие имени результата → код типа события ОРК-история. */
const RESULT_TYPE_MAP: Readonly<Record<string, string>> = Object.freeze({
    Обучение: 'edu',
    Презентация: 'presentation',
    'Обучение первичное': 'edu_first',
    'Сервисный сигнал': 'signal',
});

/**
 * Поток обработки звонка (аналог legacy `EventCalling`): закрытие/перенос
 * текущей задачи + комментарий, постановка новой задачи, записи в список
 * ОРК-история. Создаётся через `new(bitrix, portal)` (не @Injectable). Копит
 * команды в общий batch.
 */
export class CallingFlowService {
    private readonly logger = new Logger(CallingFlowService.name);
    private readonly builder: OrkHistoryElementBuilder | null = null;
    private readonly list: IPBXList | null;
    private dateCursor: Date;
    private elementCounter = 0;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        ctx: CallEventContext,
    ) {
        this.list = ctx.init.orkHistoryList;
        this.dateCursor = new Date(ctx.nowDate);
        if (this.list) {
            this.builder = new OrkHistoryElementBuilder(
                new OrkFieldResolver(this.list),
            );
        }
    }

    queue(ctx: CallEventContext): void {
        if (!this.builder || !this.list) {
            this.logger.warn('calling-flow: пропуск — нет списка ОРК-история');
            return;
        }
        const expired = ctx.planIsExpired || ctx.isNoResult;
        this.handleCurrentTask(ctx, expired);
        this.recordCompleted(ctx, expired);
        this.planned(ctx, expired);
        this.recordResultPlanned(ctx);
    }

    // ---------- task ops ----------

    private handleCurrentTask(ctx: CallEventContext, expired: boolean): void {
        const task = ctx.dto.currentTask;
        if (!task) return;

        this.bitrix.batch.task.commentAdd('add_comment_task', task.id, {
            AUTHOR_ID: ctx.dto.plan.responsibility.ID,
            POST_MESSAGE: ctx.dto.report.description,
        });

        if (expired) {
            if (ctx.planIsActive) {
                this.bitrix.batch.task.update('update_task', task.id, {
                    DEADLINE: ctx.dto.plan.deadline,
                });
            } else {
                this.bitrix.batch.task.complete('complete_task', task.id);
            }
            this.recordNoresult(ctx);
        } else {
            this.bitrix.batch.task.complete('complete_task', task.id);
        }
    }

    // ---------- history records ----------

    private recordNoresult(ctx: CallEventContext): void {
        const task = ctx.dto.currentTask;
        if (!task) return;
        const action = ctx.planIsActive
            ? EnumOrkEventAction.ea_ork_pound
            : EnumOrkEventAction.ea_ork_act_noresult_fail;
        this.addElement({
            name: `${task.type}\n${ctx.planIsActive ? 'Перенос' : 'Не состоялся'}`,
            eventTypeCode: this.eventTypeCode(task.eventType),
            eventActionCode: action,
            communicationCode: this.communicationCode(
                ctx.dto.report.communication?.type?.code,
            ),
            initiativeCode: this.initiativeCode(
                ctx.dto.report.communication?.initiative?.code,
            ),
            resultStatusCode: EnumOrkResultStatus.ork_call_result_yes,
            responsibleId: task.responsibleId,
            date: this.nextDate(),
            planDate: ctx.planIsActive ? ctx.dto.plan.deadline : '',
            comment: ctx.dto.report.description,
            crmLinks: task.ufCrmTask,
            companyLink: task.ufCrmTask,
            contactId: ctx.dto.report.contact?.ID,
        });
    }

    private recordCompleted(ctx: CallEventContext, expired: boolean): void {
        const task = ctx.dto.currentTask;
        if (!task || expired) return;
        this.addElement({
            name: `${task.type} Состоялся`,
            eventTypeCode: this.eventTypeCode(task.eventType),
            eventActionCode: EnumOrkEventAction.ea_ork_done,
            communicationCode: this.communicationCode(
                ctx.dto.report.communication?.type?.code,
            ),
            initiativeCode: this.initiativeCode(
                ctx.dto.report.communication?.initiative?.code,
            ),
            resultStatusCode: EnumOrkResultStatus.ork_call_result_yes,
            responsibleId: task.responsibleId,
            date: this.nextDate(),
            planDate: ctx.planIsActive ? ctx.dto.plan.deadline : '',
            comment: ctx.dto.report.description,
            crmLinks: ctx.crmLinks(ctx.dto.report.contact?.ID),
            companyLink: task.ufCrmTask,
            contactId: ctx.dto.report.contact?.ID,
        });
    }

    private planned(ctx: CallEventContext, expired: boolean): void {
        const plan = ctx.dto.plan;
        if (!plan.isActive || expired) return;

        const ufCrmTask = [`CO_${ctx.dto.placement.options.ID}`];
        if (ctx.dealId) ufCrmTask.push(`D_${ctx.dealId}`);
        if (plan.contact) ufCrmTask.push(`C_${plan.contact.ID}`);

        const description =
            `Инициатива: ${plan.communication?.initiative?.name ?? 'Не указано'}\n` +
            `Тип коммуникации: ${plan.communication?.type?.name ?? 'Не указано'}\n\n` +
            ctx.dto.report.description;

        this.bitrix.batch.task.add('create_task', {
            TITLE: `${plan.type.current.name}: ${plan.name}`,
            DESCRIPTION: description,
            DEADLINE: plan.deadline,
            UF_CRM_TASK: ufCrmTask,
            CREATED_BY: plan.createdBy.ID,
            RESPONSIBLE_ID: plan.responsibility.ID,
            GROUP_ID: ctx.taskGroupId,
        });

        this.addElement({
            name: `${plan.type.current.name}\n Запланирован`,
            eventTypeCode: this.eventTypeCode(plan.type.current.code),
            eventActionCode: EnumOrkEventAction.ea_ork_plan,
            communicationCode: this.communicationCode(
                plan.communication?.type?.code,
            ),
            initiativeCode: this.initiativeCode(
                plan.communication?.initiative?.code,
            ),
            responsibleId: plan.createdBy.ID,
            date: this.nextDate(),
            planDate: plan.deadline,
            comment: ctx.dto.report.description,
            crmLinks: ctx.crmLinks(plan.contact?.ID),
            companyLink: `CO_${ctx.dto.placement.options.ID}`,
            contactId: plan.contact?.ID,
        });
    }

    private recordResultPlanned(ctx: CallEventContext): void {
        const results = ctx.dto.report.results;
        const currentType = ctx.dto.currentTask?.eventType;
        const names: string[] = [];
        if (results.edu && currentType !== 'edu') names.push('Обучение');
        if (results.edu_first && currentType !== 'edu_first')
            names.push('Обучение первичное');
        if (results.presentation && currentType !== 'presentation')
            names.push('Презентация');
        if (results.signal && currentType !== 'signal')
            names.push('Сервисный сигнал');

        for (const name of names) {
            const typeCode = RESULT_TYPE_MAP[name];
            // index 0 — Запланирован, index 1 — Состоялся (как в legacy)
            for (let index = 0; index < 2; index++) {
                const done = index === 1;
                this.addElement({
                    name: `${name}\n ${done ? 'Состоялся' : 'Запланирован'}`,
                    eventTypeCode: typeCode ? `et_ork_${typeCode}` : undefined,
                    eventActionCode: done
                        ? EnumOrkEventAction.ea_ork_done
                        : EnumOrkEventAction.ea_ork_plan,
                    communicationCode: EnumOrkEventCommunication.ec_ork_call,
                    initiativeCode: EnumOrkEventInitiative.ei_ork_outgoing,
                    responsibleId: ctx.currentUserId,
                    date: this.nextDate(),
                    planDate: ctx.dto.plan?.deadline ?? '',
                    comment: ctx.dto.report.description,
                    crmLinks: ctx.crmLinks(),
                    companyLink: `CO_${ctx.dto.placement.options.ID}`,
                    contactId: ctx.dto.report.contact?.ID,
                });
            }
        }
    }

    // ---------- helpers ----------

    private addElement(params: IOrkHistoryElementParams): void {
        if (!this.builder || !this.list?.bitrixId) return;
        const fields = this.builder.build(params);
        const code = `${this.list.group}_${this.list.type}_${Date.now()}_${this.elementCounter++}`;
        this.bitrix.batch.listItem.add(
            `add_ork_history_${this.elementCounter}`,
            {
                IBLOCK_ID: this.list.bitrixId.toString(),
                ELEMENT_CODE: code,
                FIELDS: fields as unknown as IBXListItemFields,
            },
        );
    }

    private nextDate(): string {
        const formatted = formatCrmDateTime(this.dateCursor);
        this.dateCursor = new Date(this.dateCursor.getTime() + 1000);
        return formatted;
    }

    private eventTypeCode(dtoCode: string | undefined): string | undefined {
        if (!dtoCode) return undefined;
        return `et_ork_${normalizeCallingEventType(dtoCode)}`;
    }

    private communicationCode(
        code: string | undefined,
    ): EnumOrkEventCommunication {
        const value = `ec_ork_${code ?? 'call'}`;
        return Object.values(EnumOrkEventCommunication).includes(
            value as EnumOrkEventCommunication,
        )
            ? (value as EnumOrkEventCommunication)
            : EnumOrkEventCommunication.ec_ork_call;
    }

    private initiativeCode(code: string | undefined): EnumOrkEventInitiative {
        const value = `ei_ork_${code ?? 'outgoing'}`;
        return Object.values(EnumOrkEventInitiative).includes(
            value as EnumOrkEventInitiative,
        )
            ? (value as EnumOrkEventInitiative)
            : EnumOrkEventInitiative.ei_ork_outgoing;
    }
}
