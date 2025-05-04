import { Injectable } from '@nestjs/common';
import { CallingCurrentTask, CallingEventDto } from './dto/calling-event.dto';
import { IField, IPBXList, IPortal } from 'src/modules/portal/interfaces/portal.interface';
import { addHours, addMilliseconds, format } from 'date-fns';
import { PortalService } from 'src/modules/portal/portal.service';
import { BitrixApiQueueApiService } from 'src/modules/bitrix/core/queue/bitrix-queue-api.service';
import { PortalModel } from 'src/modules/portal/services/portal.model';
import { TelegramService } from 'src/modules/telegram/telegram.service';
import { randomInt } from 'crypto';

@Injectable()
export class EventServiceService {
    private portal: IPortal;
    private portalModel: PortalModel;
    private domain: string;
    private date: Date;
    private factCountIshodCommun = 0;
    private dealId: number;
    constructor(
        private readonly portalRepository: PortalService,
        private readonly bxApi: BitrixApiQueueApiService,
        private readonly telegramBot: TelegramService
    ) { }

    async init(domain: string) {
        this.portal = await this.portalRepository.getPortalByDomain(domain);
        this.bxApi.initFromPortal(this.portal);
    }

    async processEvent(callingEvent: CallingEventDto) {
        // this.portal = await this.portalRepository.getPortalByDomain(callingEvent.domain);
        this.dealId = callingEvent.bx?.dealId as number;

        if (this.dealId) {
            try {
                callingEvent.currentTask?.ufCrmTask?.push(`D_${this.dealId}`);
            } catch (error) {
                console.log('Current task нема');
            }
        }

        this.domain = callingEvent.domain;
        this.date = new Date();
        const offsetHours = parseInt(process.env.DATE_SETTING || '0', 10);
        this.date = addHours(this.date, offsetHours);

        if (callingEvent.report.resultStatus === 'noresult') {
            callingEvent.plan.isExpired = true;
        }

        // Закрывает задачу если есть
        await this.callingCurrentTask(
            callingEvent,
            callingEvent.currentTask,
            callingEvent.domain,
            callingEvent.plan,
        );

        // Запись в историю работы
        await this.recordCompletedCurrentTask(
            callingEvent.currentTask,
            callingEvent,

            callingEvent.report.description,
            callingEvent.plan ? callingEvent.plan.deadline : null,
            callingEvent.domain,
        );

        // Ставит новую задачу
        await this.planned(
            callingEvent,

            callingEvent.report.description,
        );

        // Запись результата
        await this.recordResultPlanned(callingEvent);

        // Обновление компании
        const [factCountIshodCommun, eduCount, presCount] =
            await this.updateFieldCompany(callingEvent);

        return { factCountIshodCommun, eduCount, presCount };
    }


    // заглушки для следующих методов — реализуем позже
    private async callingCurrentTask(
        callingEvent: CallingEventDto,
        currentTask: CallingEventDto['currentTask'],
        domain: string,
        plan: CallingEventDto['plan'],
    ): Promise<boolean> {
        /**
         * Работа с текущей задачей.
         */
        if (currentTask) {
            // если таковая имеется, то нужно
            // 1. завершить задачу
            // 2. совершить запись в ОРК история работы о завершении задачи

            // const bxTask = new BXTask(domain, this.portal.access_key);
            const bxTask = this.bxApi.addCmdBatch('add_comment_task', 'task.commentitem.add', {
                "TASKID": currentTask.id,
                "FIELDS": {
                    //user_id=calling_event.departament.currentUser.ID,
                    "AUTHOR_ID": callingEvent.plan.responsibility.ID,
                    "POST_MESSAGE": callingEvent.report.description,
                }
            })
            // bxTask.addCommentTaskBatch({
            //     id_task: currentTask.id,
            //     user_id: callingEvent.departament.currentUser.ID,
            //     message: callingEvent.report.description,
            // });

            if (plan && plan.isExpired) {
                if (plan.isActive) {
                    // перенос
                    // await bxTask.deadlineChange({
                    //     id_task: currentTask.id,
                    //     deadline: plan.deadline,
                    // });
                    this.bxApi.addCmdBatch('update_task', 'tasks.task.update', {
                        "taskId": currentTask.id,
                        "fields": {
                            "DEADLINE": plan.deadline,
                        }
                    })
                } else {
                    // несостоялся
                    plan = null as unknown as CallingEventDto['plan'];
                    // await bxTask.complete({ id_task: currentTask.id });
                    this.bxApi.addCmdBatch('complete_task', 'tasks.task.complete', {
                        "taskId": currentTask.id,
                    })
                }

                await this.recordNoresult(callingEvent);
            } else {
                // const resultCompleteTask = await bxTask.complete({
                //     id_task: currentTask.id,
                // });
                this.bxApi.addCmdBatch('complete_task', 'tasks.task.complete', {
                    "taskId": currentTask.id,
                })
            }
        }

        return true;
    }

    async recordNoresult(callingEvent: CallingEventDto): Promise<void> {
        const currentTask = callingEvent.currentTask as CallingCurrentTask;
        const orkHistoryList = this.portalModel.getListByCode('ork_history');
        if (!orkHistoryList) throw new TypeError('Dont list ork_history');

        const initFields: Record<string, any> = {};
        const typeTitle = `${currentTask.type}\n${callingEvent.plan.isActive ? 'Перенос' : 'Не состоялся'}`;
        initFields['NAME'] = typeTitle;

        const fieldName = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'event_title');
        if (fieldName) {
            initFields[(fieldName as IField).bitrixCamelId] = typeTitle;
        }


        const fieldCompany = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_crm_company');
        if (fieldCompany) {
            initFields[fieldCompany.bitrixCamelId] = currentTask.ufCrmTask;
        }

        const fieldCrm = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'crm');
        if (fieldCrm) {
            initFields[fieldCrm.bitrixCamelId] = currentTask.ufCrmTask;
        }

        const fieldDate = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_date');
        if (fieldDate) {
            initFields[fieldDate.bitrixCamelId] = format(this.date, 'dd.MM.yyyy HH:mm:ss');
            this.date = addMilliseconds(this.date, 1000);
        }

        const fieldEventType = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_type');
        if (currentTask.eventType === 'pere_long') currentTask.eventType = 'complect_up_work';
        else if (currentTask.eventType === 'commer') currentTask.eventType = 'info';
        if (fieldEventType) {
            const valueEventType = await this.portalModel.getIdByValueFieldItemList(
                fieldEventType.items,
                `et_ork_${currentTask.eventType}`,
            );
            initFields[fieldEventType.bitrixCamelId] = valueEventType?.bitrixId || '';
        }

        const fieldEventAction = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_action');
        let value = 'ea_ork_done';
        if (callingEvent.plan?.isExpired) {
            if (callingEvent.plan.isActive) value = 'ea_ork_pound';
            else value = 'ea_ork_act_noresult_fail';
        }
        if (fieldEventAction) {
            const valueEventAction = await this.portalModel.getIdByValueFieldItemList(
                fieldEventAction.items,
                value,
            );
            if (valueEventAction) {
                initFields[fieldEventAction.bitrixCamelId] = valueEventAction.bitrixId;
            }
        }

        const fieldCommunication = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'event_communication');
        if (fieldCommunication) {
            try {
                const typeCode = callingEvent.report.communication?.type?.code || 'call';
                const value = await this.portalModel.getIdByValueFieldItemList(
                    fieldCommunication.items,
                    `ec_ork_${typeCode}`,
                );
                if (value) {
                    initFields[fieldCommunication.bitrixCamelId] = value.bitrixId;
                }



            } catch (e) {
                this.telegramBot.sendMessageAdminError(
                    `record_completed_current_task:\nERROR: \n${callingEvent.report.communication.type} - не найдено \n\ndomain: ${this.domain}`
                );
            }

            const fieldInitiative = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_initiative');
            if (fieldInitiative) {


                try {
                    const initiativeCode = callingEvent.report.communication?.initiative?.code || 'outgoing';
                    const value = await this.portalModel.getIdByValueFieldItemList(
                        fieldInitiative.items,
                        `ei_ork_${initiativeCode}`,
                    );
                    if (value) {
                        initFields[fieldInitiative.bitrixCamelId] = value.bitrixId;
                    }
                } catch (e) {
                    this.telegramBot.sendMessageAdminError(
                        `record_completed_current_task:\nERROR: \n${callingEvent.report.communication.initiative} - не найдено \n\ndomain: ${this.domain}`
                    );
                }
            }
            const fieldResponsible = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'responsible');
            if (fieldResponsible) {
                initFields[fieldResponsible.bitrixCamelId] = currentTask.responsibleId;
            }

            const fieldPlanDate = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_plan_date');
            if (fieldPlanDate) {
                initFields[fieldPlanDate.bitrixCamelId] = !callingEvent.plan?.isActive ? '' : callingEvent.plan.deadline;
            }

            const fieldComment = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'manager_comment');
            if (fieldComment) {
                initFields[fieldComment.bitrixCamelId] = callingEvent.report.description;
            }

            const fieldResultStatus = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_result_status');
            if (fieldResultStatus) {
                const valueResult = await this.portalModel.getIdByValueFieldItemList(
                    fieldResultStatus.items,
                    'ork_call_result_yes',
                );
                if (valueResult) {
                    initFields[fieldResultStatus.bitrixCamelId] = valueResult.bitrixId;
                }
            }

            const fieldAuthor = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'author');
            if (fieldAuthor) {
                initFields[fieldAuthor.bitrixCamelId] = currentTask.responsibleId;
            }

            const fieldSu = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'su');
            if (fieldSu) {
                initFields[fieldSu.bitrixCamelId] = currentTask.responsibleId;
            }

            if (callingEvent.report.contact) {
                const fieldContact = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_crm_contact');
                if (fieldContact) {
                    initFields[fieldContact.bitrixCamelId] = callingEvent.report.contact.ID;
                }
            }

            // const bxListDto = new BXListElementDto({
            //     IBLOCK_CODE: orkHistoryList.type,
            //     ELEMENT_CODE: `${orkHistoryList.group}_${randomInt(0, 1000)}_${orkHistoryList.type}_${randomInt(0, 1000)}`,
            //     FIELDS: initFields,
            // });

            // const bxList = new BXList(this.domain, this.portal.access_key);
            // await bxList.createElement(bxListDto);
        }
    }

    async recordCompletedCurrentTask(
        currentTask: CallingEventDto['currentTask'],
        callingEvent: CallingEventDto,
        description: string,
        planDate: string | null,
        domain: string,
    ): Promise<void> {
        if (!currentTask) return;
        if (callingEvent.plan?.isExpired) return;

        const orkHistoryList = this.portalModel.getListByCode('ork_history');
        if (!orkHistoryList) throw new TypeError('Dont list ork_history');

        const initFields: Record<string, any> = {
            NAME: `${currentTask.type} Состоялся`,
        };

        const getFieldValue = (code: string, defaultValue: any = null): string => {
            const field = this.portalModel.getIdByCodeFieldList(orkHistoryList, code);
            if (!field) {
                this.telegramBot.sendMessageAdminError(
                    `get_field_value\ncode: ${code} не найдено \n\ndomain: ${domain}`
                );
            }
            return field?.bitrixCamelId || defaultValue;
        };

        initFields[getFieldValue('event_title')] = `${currentTask.type}\nСостоялся`;
        initFields[getFieldValue('ork_crm_company')] = currentTask.ufCrmTask;
        initFields[getFieldValue('crm')] = currentTask.ufCrmTask;
        initFields[getFieldValue('ork_event_date')] = format(this.date, 'dd.MM.yyyy HH:mm:ss');
        this.date = addMilliseconds(this.date, 1000);

        const eventTypeCode = currentTask.eventType === 'pere_long'
            ? 'complect_up_work'
            : currentTask.eventType === 'commer'
                ? 'info'
                : currentTask.eventType;

        const valueEventTypeItems = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_type')?.items;
        if (!valueEventTypeItems) throw new TypeError('Dont list ork_event_type');
        const valueEventType = await this.portalModel.getIdByValueFieldItemList(
            valueEventTypeItems,
            `et_ork_${eventTypeCode}`,
        );
        initFields[getFieldValue('ork_event_type')] = valueEventType?.bitrixId || '';

        const eventActionCode =
            !callingEvent.plan || !callingEvent.plan.isExpired
                ? 'ea_ork_done'
                : 'ea_ork_pound';

        const valueEventActionItems = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_action')?.items;
        if (!valueEventActionItems) throw new TypeError('Dont list ork_event_action');
        const valueEventAction = await this.portalModel.getIdByValueFieldItemList(
            valueEventActionItems,
            eventActionCode,
        );
        initFields[getFieldValue('ork_event_action')] = valueEventAction?.bitrixId || '';

        const communicationCode = callingEvent.report.communication?.type?.code
            ? `ec_ork_${callingEvent.report.communication.type.code}`
            : 'ec_ork_call';

        const communicationItems = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'event_communication')?.items;
        if (!communicationItems) throw new TypeError('Dont list event_communication');
        const communicationValue = await this.portalModel.getIdByValueFieldItemList(
            communicationItems,
            communicationCode,
        );
        if (!communicationValue) {
            this.telegramBot.sendMessageAdminError(
                `record_completed_current_task:\nERROR: \n${callingEvent.report.communication.type?.code} - не найдено \n\ndomain: ${domain}`
            );
        }
        initFields[getFieldValue('event_communication')] = communicationValue?.bitrixId || '';

        const initiativeCode = callingEvent.report.communication?.initiative?.code
            ? `ei_ork_${callingEvent.report.communication.initiative.code}`
            : 'ei_ork_outgoing';

        const initiativeItems = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_initiative')?.items;
        if (!initiativeItems) throw new TypeError('Dont list ork_event_initiative');
        const initiativeValue = await this.portalModel.getIdByValueFieldItemList(
            initiativeItems,
            initiativeCode,
        );
        if (!initiativeValue) {
            this.telegramBot.sendMessageAdminError(
                `record_completed_current_task:\nERROR: \n${callingEvent.report.communication.initiative?.code} - не найдено \n\ndomain: ${domain}`
            );
        }
        initFields[getFieldValue('ork_event_initiative')] = initiativeValue?.bitrixId || '';

        const resultItems = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_result_status')?.items;
        if (!resultItems) throw new TypeError('Dont list ork_result_status');
        const resultValue = await this.portalModel.getIdByValueFieldItemList(
            resultItems,
            'ork_call_result_yes',
        );
        if (!resultValue) {
            this.telegramBot.sendMessageAdminError(
                `record_completed_current_task:\nERROR: \n${callingEvent.report.communication.initiative?.code} - не найдено \n\ndomain: ${domain}`
            );
        }
        initFields[getFieldValue('ork_result_status')] = resultValue?.bitrixId || '';

        initFields[getFieldValue('responsible')] = currentTask.responsibleId;
        initFields[getFieldValue('ork_plan_date')] = planDate;
        initFields[getFieldValue('manager_comment')] = description;
        initFields[getFieldValue('author')] = currentTask.responsibleId;
        initFields[getFieldValue('su')] = currentTask.responsibleId;

        if (callingEvent.report.contact) {
            initFields[getFieldValue('ork_crm_contact')] = callingEvent.report.contact.ID;
        }

        // const bxListDto = new BXListElementDto({
        //   IBLOCK_CODE: orkHistoryList.type,
        //   ELEMENT_CODE: `${orkHistoryList.group}_${randomInt(0, 1000)}_${orkHistoryList.type}_${randomInt(0, 1000)}`,
        //   FIELDS: initFields,
        // });

        // const bxList = new BXList(domain, this.portal.access_key);
        // await bxList.createElement(bxListDto);
    }

    async planned(
        callingEvent: CallingEventDto,
        description: string,

    ): Promise<void> {
        /** Запланировать задачу */
        const plan = callingEvent.plan;
        if (!plan?.isActive) return;
        if (!plan || plan.isExpired) return;

        // const bxTask = new BXTask(this.domain, this.portal.access_key);

        let descriptionMeta = `Инициатива: ${plan.communication?.initiative?.name || 'Не указано'}\n`;
        descriptionMeta += `Тип коммуникации: ${plan.communication?.type?.name || 'Не указано'}\n\n`;
        descriptionMeta += description;

        const ufCrmTask = [`CO_${callingEvent.placement.options.ID}`];
        if (this.dealId) {
            ufCrmTask.push(`D_${this.dealId}`);
        }
        if (plan.contact) {
            ufCrmTask.push(`C_${plan.contact.ID}`);
        }

        const field = {
            TITLE: `${plan.type.current.name}: ${plan.name}`,
            DESCRIPTION: descriptionMeta,
            DEADLINE: plan.deadline,
            UF_CRM_TASK: ufCrmTask,
            CREATED_BY: plan.createdBy.ID,
            RESPONSIBLE_ID: plan.responsibility.ID,
            GROUP_ID: callingEvent.bx.taskGroupId,
        };

        void this.bxApi.addCmdBatch('create_task', 'tasks.task.add', {
            "fields": field,
        });
        void this.recordPlannedTask(callingEvent);
    }


    async recordPlannedTask(callingEvent: CallingEventDto): Promise<any> {
        /** Запись планирования задачи */
        this.factCountIshodCommun++;
        const plan = callingEvent.plan;
        const orkHistoryList = this.portalModel.getListByCode('ork_history');
        if (!orkHistoryList) throw new TypeError('Dont list ork_history');
        const initFields: Record<string, any> = {};

        initFields['NAME'] = `${plan.type.current.name}\n Запланирован`;

        const fieldName = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'event_title');
        initFields[fieldName?.bitrixCamelId || ''] = `${plan.type.current.name}\n Запланирован`;

        const fieldCompany = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_crm_company');
        initFields[fieldCompany?.bitrixCamelId || ''] = callingEvent.placement.options.ID;

        const fieldCrm = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'crm');
        try {
            initFields[fieldCrm?.bitrixCamelId || ''] = callingEvent.currentTask?.ufCrmTask || '';
        } catch {
            initFields[fieldCrm?.bitrixCamelId || ''] = [
                `CO_${callingEvent.placement.options.ID}`,
                this.dealId ? `D_${this.dealId}` : '',
            ];
        }

        const fieldDate = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_date');
        initFields[fieldDate?.bitrixCamelId || ''] = format(this.date, 'dd.MM.yyyy HH:mm:ss');
        this.date = addMilliseconds(this.date, 1000);

        let typeCode = plan.type.current.code;
        if (typeCode === 'pere_long') typeCode = 'complect_up_work';
        else if (typeCode === 'commer') typeCode = 'info';

        const fieldEventType = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_type');
        const valueEventType = await this.portalModel.getIdByValueFieldItemList(fieldEventType?.items || [], `et_ork_${typeCode}`);
        initFields[fieldEventType?.bitrixCamelId || ''] = valueEventType?.bitrixId || '';

        const fieldEventAction = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_action');
        const valueEventAction = await this.portalModel.getIdByValueFieldItemList(fieldEventAction?.items || [], 'ea_ork_plan');
        initFields[fieldEventAction?.bitrixCamelId || ''] = valueEventAction?.bitrixId || '';

        const fieldCommunication = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'event_communication');
        const valueCommunication = await this.portalModel.getIdByValueFieldItemList(
            fieldCommunication?.items || [],
            `ec_ork_${plan.communication?.type?.code}`,
        );
        initFields[fieldCommunication?.bitrixCamelId || ''] = valueCommunication?.bitrixId || '';

        const fieldInitiative = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_initiative');
        const valueInitiative = await this.portalModel.getIdByValueFieldItemList(
            fieldInitiative?.items || [],
            `ei_ork_${plan.communication?.initiative?.code}`,
        );
        initFields[fieldInitiative?.bitrixCamelId || ''] = valueInitiative?.bitrixId;

        const fieldResponsible = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'responsible');
        initFields[fieldResponsible?.bitrixCamelId || ''] = plan.createdBy.ID;

        const fieldPlanDate = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_plan_date');
        initFields[fieldPlanDate?.bitrixCamelId || ''] = plan.deadline;

        const fieldComment = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'manager_comment');
        initFields[fieldComment?.bitrixCamelId || ''] = callingEvent.report.description;

        const fieldAuthor = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'author');
        initFields[fieldAuthor?.bitrixCamelId || ''] = plan.createdBy.ID;

        const fieldSu = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'su');
        initFields[fieldSu?.bitrixCamelId || ''] = plan.createdBy.ID;

        if (plan.contact) {
            const fieldContact = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_crm_contact');
            initFields[fieldContact?.bitrixCamelId || ''] = plan.contact.ID;
        }

        // const bxListDto = new BXListElementDto({
        //   IBLOCK_CODE: orkHistoryList.type,
        //   ELEMENT_CODE: `${orkHistoryList.group}_${randomInt(0, 1000)}_${orkHistoryList.type}_${randomInt(0, 1000)}`,
        //   FIELDS: initFields,
        // });

        // const bxList = new BXList(callingEvent.domain, this.portal.access_key);
        const bxList = await this.bxApi.call('lists.element.add', {
            IBLOCK_TYPE_ID: 'lists',
            IBLOCK_CODE: orkHistoryList.type,
            ELEMENT_CODE: `${orkHistoryList.group}_${randomInt(0, 1000)}_${orkHistoryList.type}_${randomInt(0, 1000)}`,
            FIELDS: initFields,
        })
        return bxList;
    }


    async recordResultPlanned(callingEvent: CallingEventDto): Promise<void> {
        /** Запись планирования задачи */
        const namesPlannedList: string[] = [];
        const currentTask = callingEvent.currentTask;
        const results = callingEvent.report.results;

        if (results.edu && (!currentTask || currentTask.eventType !== 'edu')) {
            namesPlannedList.push('Обучение');
        }
        if (results.edu_first && (!currentTask || currentTask.eventType !== 'edu_first')) {
            namesPlannedList.push('Обучение первичное');
        }
        if (results.presentation && (!currentTask || currentTask.eventType !== 'presentation')) {
            namesPlannedList.push('Презентация');
        }
        if (results.signal && (!currentTask || currentTask.eventType !== 'signal')) {
            namesPlannedList.push('Сервисный сигнал');
        }

        // const bxList = new BXList(callingEvent.domain, this.portal.access_key);

        for (const name of namesPlannedList) {
            this.factCountIshodCommun++;
            let flagPlanOrComplete = false;

            for (let index = 0; index < 2; index++) {
                const plan = callingEvent.plan;
                const orkHistoryList = this.portalModel.getListByCode('ork_history') as IPBXList;
                const initFields: Record<string, any> = {};

                const title = `${name} ${flagPlanOrComplete ? 'Состоялся' : 'Запланирован'}`;
                initFields['NAME'] = title;

                const fieldName = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'event_title');
                initFields[fieldName?.bitrixCamelId || ''] = `${name}\n ${flagPlanOrComplete ? 'Состоялся' : 'Запланирован'}`;

                const fieldCompany = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_crm_company');
                initFields[fieldCompany?.bitrixCamelId || ''] = callingEvent.placement.options.ID;

                const fieldCrm = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'crm') as IField;
                const crmList: string[] = [];
                const companyId = callingEvent.bx.companyId;
                const dealId = callingEvent.bx.dealId;
                if (companyId) crmList.push(`CO_${companyId}`);
                if (dealId) crmList.push(`D_${dealId}`);
                initFields[fieldCrm.bitrixCamelId] = crmList;

                const fieldDate = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_date') as IField;
                initFields[fieldDate.bitrixCamelId] = format(this.date, 'dd.MM.yyyy HH:mm:ss');
                this.date = addMilliseconds(this.date, 1000);

                const fieldEventType = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_type');
                let typeCode = '';
                if (name === 'Обучение') typeCode = 'edu';
                else if (name === 'Презентация') typeCode = 'presentation';
                else if (name === 'Обучение первичное') typeCode = 'edu_first';
                else if (name === 'Общение по продлению') typeCode = 'complect_up_work';
                else if (name === 'Сервисный сигнал') typeCode = 'signal';

                const valueEventType = await this.portalModel.getIdByValueFieldItemList(
                    fieldEventType?.items || [],
                    `et_ork_${typeCode}`,
                );
                initFields[fieldEventType?.bitrixCamelId || ''] = valueEventType?.bitrixId || '';

                const fieldEventAction = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_action');
                const valueEventAction = await this.portalModel.getIdByValueFieldItemList(
                    fieldEventAction?.items || [],
                    flagPlanOrComplete ? 'ea_ork_done' : 'ea_ork_plan',
                );
                initFields[fieldEventAction?.bitrixCamelId || ''] = valueEventAction?.bitrixId || '';

                const fieldCommunication = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'event_communication');
                const valueCommunication = await this.portalModel.getIdByValueFieldItemList(
                    fieldCommunication?.items || [],
                    'ec_ork_call',
                );
                initFields[fieldCommunication?.bitrixCamelId || ''] = valueCommunication?.bitrixId || '';

                const fieldInitiative = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_event_initiative');
                const valueInitiative = await this.portalModel.getIdByValueFieldItemList(
                    fieldInitiative?.items || [],
                    'ei_ork_outgoing',
                );
                initFields[fieldInitiative?.bitrixCamelId || ''] = valueInitiative?.bitrixId || '';

                const fieldResponsible = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'responsible');
                const userId = callingEvent.departament.currentUser.ID;
                initFields[fieldResponsible?.bitrixCamelId || ''] = userId;

                const fieldPlanDate = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_plan_date');
                initFields[fieldPlanDate?.bitrixCamelId || ''] = plan?.deadline || '';

                const fieldComment = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'manager_comment');
                initFields[fieldComment?.bitrixCamelId || ''] = callingEvent.report.description;

                const fieldAuthor = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'author');
                initFields[fieldAuthor?.bitrixCamelId || ''] = userId;

                const fieldSu = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'su');
                initFields[fieldSu?.bitrixCamelId || ''] = userId;

                if (callingEvent.report.contact) {
                    const fieldContact = this.portalModel.getIdByCodeFieldList(orkHistoryList, 'ork_crm_contact');
                    initFields[fieldContact?.bitrixCamelId || ''] = callingEvent.report.contact.ID;
                }

                const bxListDto = {
                    IBLOCK_TYPE_ID: 'lists',
                    IBLOCK_CODE: orkHistoryList.type,
                    ELEMENT_CODE: `${orkHistoryList.group}_${randomInt(0, 1000)}_${orkHistoryList.type}_${randomInt(0, 1000)}`,
                    FIELDS: initFields,
                };

                void this.bxApi.addCmdBatch(
                    `create_element_list_${typeCode}_${index}`,
                    'lists.element.add',
                    bxListDto,
                );

                flagPlanOrComplete = true;
            }
        }

        await this.bxApi.callBatch();
    }


    async updateFieldCompany(callingEvent: CallingEventDto): Promise<[number, number, number]> {
        /** Обновить поля компании */
        // const bxCompany = new BXCompany(callingEvent.domain, this.portal.access_key);
        // const bxDeal = new BXDeal(callingEvent.domain, this.portal.access_key);
        const company = await this.bxApi.call('crm.company.get', {
            ID: callingEvent.placement.options.ID,
        });

        const initFields: Record<string, any> = {};
        const now = new Date();

        // ОРК Комментарий История
        const historyField = this.portalModel.getCompanyFieldByCode('ork_last_history') as IField;
        const historyKey = `UF_CRM_${historyField.bitrixId}`;
        const historyText = `${format(now, 'dd.MM.yyyy')} в ${format(now, 'HH:mm')}\n${callingEvent.report.description}`;
        initFields[historyKey] = [historyText, ...(Array.isArray(company[historyKey]) ? company[historyKey] : [])].slice(0, 8);

        // ОРК Тема следующего звонка
        const nextCallNameField = this.portalModel.getCompanyFieldByCode('ork_next_call_name') as IField;
        // const bxTask = new BXTask(callingEvent.domain, this.portal.access_key);


        // const currentTasks = await bxTask.getTaskByCompanyId(company.ID);

        const filter = {
            UF_CRM_TASK: [`CO_${company.ID}`],
            '<=STATUS': 3,
        };
        const select = ['ID', 'TITLE', 'PARENT_ID', 'RESPONSIBLE_ID', 'STATUS', 'UF_CRM_TASK', 'DEADLINE'];

        const result = await this.bxApi.call('tasks.task.list', {
            filter,
            select,
        });
        const currentTasks = result.tasks;

        initFields[`UF_CRM_${nextCallNameField.bitrixId}`] = currentTasks?.[0]?.title || '';

        // ОРК Дата следующего звонка
        const nextCallDateField = this.portalModel.getCompanyFieldByCode('ork_next_call_date') as IField;
        initFields[`UF_CRM_${nextCallDateField.bitrixId}`] = currentTasks?.[0]?.deadline ? format(currentTasks[0].deadline, 'dd.MM.yyyy HH:mm') : '';

        // ОРК Тема последнего звонка
        const lastCallNameField = this.portalModel.getCompanyFieldByCode('ork_last_call_name') as IField;
        initFields[`UF_CRM_${lastCallNameField.bitrixId}`] = company.UF_CRM_ORK_NEXT_CALL_NAME;

        // ОРК Дата последнего звонка
        const lastCallDateField = this.portalModel.getCompanyFieldByCode('ork_last_call_date') as IField;
        initFields[`UF_CRM_${lastCallDateField.bitrixId}`] = format(now, 'dd.MM.yyyy HH:mm');

        // Фактическое количество исходящих коммуникаций
        const factCountField = this.portalModel.getCompanyFieldByCode('ork_communication_fact_count') as IField;
        const companyCount = typeof company.UF_CRM_ORK_COMMUNICATION_FACT_COUNT === 'number' ? company.UF_CRM_ORK_COMMUNICATION_FACT_COUNT : 0;
        this.factCountIshodCommun += companyCount;
        initFields[`UF_CRM_${factCountField.bitrixId}`] = this.factCountIshodCommun;

        let presCount = Number(company.UF_CRM_ORK_PRES_COUNT || 0);
        let eduCount = Number(company.UF_CRM_ORK_EDU_COUNT || 0);

        if (callingEvent.report.results.presentation) {
            presCount++;
            const presField = this.portalModel.getCompanyFieldByCode('ork_pres_count') as IField;
            initFields[`UF_CRM_${presField.bitrixId}`] = presCount;

            const lastPresNameField = this.portalModel.getCompanyFieldByCode('ork_last_pres_name') as IField;
            initFields[`UF_CRM_${lastPresNameField.bitrixId}`] = callingEvent.report.description;

            const lastPresDateField = this.portalModel.getCompanyFieldByCode('ork_last_pres_date') as IField;
            initFields[`UF_CRM_${lastPresDateField.bitrixId}`] = format(this.date, 'dd.MM.yyyy HH:mm');

            let taskNamePres = '';
            let taskDatePres = '';
            for (const task of currentTasks || []) {
                if (task.title?.includes('Презентация:')) {
                    taskNamePres = task.description;
                    taskDatePres = task.deadline;
                }
            }
            const nextPresNameField = this.portalModel.getCompanyFieldByCode('ork_next_pres_name') as IField;
            initFields[`UF_CRM_${nextPresNameField.bitrixId}`] = taskNamePres;

            const nextPresDateField = this.portalModel.getCompanyFieldByCode('ork_next_pres_date') as IField;
            initFields[`UF_CRM_${nextPresDateField.bitrixId}`] = taskDatePres;
        }

        if (callingEvent.report.results.edu) {
            eduCount++;
            const eduField = this.portalModel.getCompanyFieldByCode('ork_edu_count') as IField;
            initFields[`UF_CRM_${eduField.bitrixId}`] = eduCount;

            const lastEduNameField = this.portalModel.getCompanyFieldByCode('ork_last_edu_name') as IField;
            initFields[`UF_CRM_${lastEduNameField.bitrixId}`] = callingEvent.report.description;

            const lastEduDateField = this.portalModel.getCompanyFieldByCode('ork_last_edu_date') as IField;
            initFields[`UF_CRM_${lastEduDateField.bitrixId}`] = format(this.date, 'dd.MM.yyyy HH:mm');

            let taskNameEdu = '';
            let taskDateEdu = '';
            for (const task of currentTasks || []) {
                if (task.title?.includes('Обучение:')) {
                    taskNameEdu = task.description;
                    taskDateEdu = task.deadline;
                }
            }
            const nextEduNameField = this.portalModel.getCompanyFieldByCode('ork_next_edu_name') as IField;
            initFields[`UF_CRM_${nextEduNameField.bitrixId}`] = taskNameEdu;

            const nextEduDateField = this.portalModel.getCompanyFieldByCode('ork_next_edu_date') as IField;
            initFields[`UF_CRM_${nextEduDateField.bitrixId}`] = taskDateEdu;
        }

        if (callingEvent.plan?.type?.current.code === 'presentation') {
            const nextPresNameField = this.portalModel.getCompanyFieldByCode('ork_next_pres_name') as IField;
            initFields[`UF_CRM_${nextPresNameField.bitrixId}`] = callingEvent.plan.name;

            const nextPresDateField = this.portalModel.getCompanyFieldByCode('ork_next_pres_date') as IField;
            initFields[`UF_CRM_${nextPresDateField.bitrixId}`] = callingEvent.plan.deadline;
        } else if (["first_edu", "edu"].includes(callingEvent.plan?.type?.current.code)) {
            const nextEduNameField = this.portalModel.getCompanyFieldByCode('ork_next_edu_name') as IField;
            initFields[`UF_CRM_${nextEduNameField.bitrixId}`] = callingEvent.plan.name;

            const nextEduDateField = this.portalModel.getCompanyFieldByCode('ork_next_edu_date') as IField;
            initFields[`UF_CRM_${nextEduDateField.bitrixId}`] = callingEvent.plan.deadline;
        }

        // void bxCompany.updateCompany({ fields: initFields, companyId: callingEvent.placement.options.ID });

        this.bxApi.addCmdBatch('update_company', 'crm.company.update', {
            fields: initFields,
            ID: callingEvent.placement.options.ID,
        });

        this.bxApi.addCmdBatch('update_deal', 'crm.deal.update', {
            ID: this.dealId,
            fields: initFields,
        });
        await this.bxApi.callBatch();
        return [this.factCountIshodCommun, eduCount, presCount];
    }


    async processSmartReport(callingEvent: CallingEventDto) {
        // Аналог EventSmartReportNew().new_event(...)
        // TODO: реализовать нужную бизнес-логику
    }
}
