import { Logger } from '@nestjs/common';
import { BitrixService, IBXCompany, IBXItem } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IPSmart } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxServiceMonthFieldCode } from '@lib/portal-lib/pbx';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { CallEventContext } from '../context/call-event.context';
import { OrkFieldResolver } from '../ork/ork-field.resolver';
import {
    ISmartClient,
    SmartReportClientAggregator,
    createEmptyClientFields,
} from './smart-report-client-aggregator';
import { SmartReportDealFieldsService } from './smart-report-deal-fields.service';
import {
    calcPlannedCommunications,
    calcDegreeNeeds,
} from './utils/contact-metrics.util';
import { calcDateCallNext } from './utils/next-call.util';

type SmartFieldValue = string | number | string[];

/** Заголовок задач обучения для поиска ближайшей даты (как в legacy). */
const EDU_TASK_TITLE = 'обучение';

/**
 * Поток смарт-отчёта «Отчёт за месяц» (аналог legacy `EventSmartReportNew`).
 * Создаётся через `new(bitrix, portal)` — не @Injectable (CLAUDE.md). Только
 * копит команды `crm.item.add/update` в общий batch; чтения уже сделаны в init.
 */
export class SmartReportFlowService {
    private readonly logger = new Logger(SmartReportFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: CallEventContext): void {
        const smart = ctx.init.smart;
        const company = ctx.init.company;
        if (!smart?.entityTypeId || !company || !ctx.init.orkHistoryList) {
            this.logger.warn(
                'smart-report: пропуск — нет smart/company/ork-list',
            );
            return;
        }

        const resolver = new OrkFieldResolver(ctx.init.orkHistoryList);
        const aggregator = new SmartReportClientAggregator(resolver);
        const dealFieldsService = new SmartReportDealFieldsService(this.portal);
        const dealFields = dealFieldsService.build(
            smart,
            ctx.init.baseDeal,
            ctx.init.productRows,
        );

        const clients = this.buildInitialClients(ctx, company);

        for (const element of ctx.init.orkHistoryElements) {
            aggregator.mergeElementIntoClients(
                clients,
                aggregator.aggregateElement(element),
            );
        }

        const companyClient = clients.find(c => c.bxId === Number(company.ID));
        if (companyClient) {
            aggregator.mergeContactsIntoCompany(
                companyClient,
                clients.filter(c => c.bxId !== companyClient.bxId),
            );
        }

        for (const client of clients) {
            this.queueClient(ctx, smart, company, client, dealFields);
        }
    }

    /** Инициализирует клиентов: контакты + компания с плановыми коммуникациями. */
    private buildInitialClients(
        ctx: CallEventContext,
        company: IBXCompany,
    ): ISmartClient[] {
        const clients: ISmartClient[] = [];
        let planSum = 0;
        for (const contact of ctx.init.contacts) {
            const frequency = calcPlannedCommunications(
                (contact as Record<string, unknown>).UF_CRM_ORK_CALL_FREQUENCY,
            );
            planSum += frequency;
            const fields = createEmptyClientFields();
            fields.countCommunicationPlan = frequency;
            fields.degreeNeed = calcDegreeNeeds(
                (contact as Record<string, unknown>).UF_CRM_ORK_NEEDS,
            );
            clients.push({ bxId: Number(contact.ID), fields });
        }
        const companyFields = createEmptyClientFields();
        companyFields.countCommunicationPlan = planSum;
        clients.push({ bxId: Number(company.ID), fields: companyFields });
        return clients;
    }

    private queueClient(
        ctx: CallEventContext,
        smart: IPSmart,
        company: IBXCompany,
        client: ISmartClient,
        dealFields: Record<string, SmartFieldValue>,
    ): void {
        const contact = ctx.init.contacts.find(
            c => Number(c.ID) === client.bxId,
        );
        const isCompany = !contact;

        const out: Record<string, SmartFieldValue> = {};
        const title = isCompany
            ? `Компания: ${company.TITLE ?? ''}`
            : `Контакт: ${contact?.NAME ?? ''}`;
        const assignedById = isCompany
            ? Number(company.ASSIGNED_BY_ID ?? 0)
            : Number(contact?.ASSIGNED_BY_ID ?? 0);

        // Ответственный — текущий пользователь события
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.responsible,
            ctx.currentUserId,
        );
        this.set(out, smart, PbxServiceMonthFieldCode.crm_company, company.ID);

        const crmLinks: string[] = [`CO_${company.ID}`];

        if (contact) {
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.crm_contact,
                Number(contact.ID),
            );
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.type_client,
                contact.TYPE_ID ?? '',
            );
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.position,
                contact.POST ?? '',
            );
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.phone,
                this.firstValue(contact.PHONE),
            );
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.email,
                this.firstValue(contact.EMAIL),
            );
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.date_next_call,
                calcDateCallNext(ctx.init.companyTasks),
            );
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.date_next_edu,
                calcDateCallNext(ctx.init.companyTasks, {
                    title: EDU_TASK_TITLE,
                }),
            );
        } else {
            for (const c of ctx.init.contacts) {
                crmLinks.push(`C_${c.ID}`);
            }
            if (ctx.init.contacts.length) {
                client.fields.countCommunicationPlan /=
                    ctx.init.contacts.length;
                const totalNeed = ctx.init.contacts.reduce(
                    (sum, c) =>
                        sum +
                        calcDegreeNeeds(
                            (c as Record<string, unknown>).UF_CRM_ORK_NEEDS,
                        ),
                    0,
                );
                client.fields.degreeNeed = totalNeed / ctx.init.contacts.length;
            }
            client.fields.dateNextCall = calcDateCallNext(
                ctx.init.companyTasks,
            );
            client.fields.dateNextEdu = calcDateCallNext(
                ctx.init.companyTasks,
                { title: EDU_TASK_TITLE },
            );
        }

        this.set(out, smart, PbxServiceMonthFieldCode.crm, crmLinks);
        this.applyAggregatedFields(out, smart, client);

        const fields: Record<string, SmartFieldValue> = {
            title,
            assignedById,
            ...out,
        };
        if (isCompany) {
            Object.assign(fields, dealFields);
        }

        this.queueAddOrUpdate(ctx, smart, title, fields);
    }

    /** Переносит агрегированные счётчики/даты/ответственных клиента в поля смарта. */
    private applyAggregatedFields(
        out: Record<string, SmartFieldValue>,
        smart: IPSmart,
        client: ISmartClient,
    ): void {
        const f = client.fields;
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_communication_fact,
            f.countCommunicationFact,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_communication_incoming,
            f.countCommunicationIncoming,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_communication_outgoing,
            f.countCommunicationOutgoing,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_presentation,
            f.countPresentation,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_first_edu,
            f.countFirstEdu,
        );
        this.set(out, smart, PbxServiceMonthFieldCode.count_edu, f.countEdu);
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_signal,
            f.countSignal,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_success_signal,
            f.countSuccessSignal,
        );
        this.set(out, smart, PbxServiceMonthFieldCode.count_call, f.countCall);
        this.set(out, smart, PbxServiceMonthFieldCode.count_face, f.countFace);
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.count_communication_plan,
            f.countCommunicationPlan,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.date_last_call,
            f.dateLastCall,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.date_last_edu,
            f.dateLastEdu,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.responsible_edu,
            f.responsibleEdu,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.responsible_first_edu,
            f.responsibleFirstEdu,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.responsible_presentation,
            f.responsiblePresentation,
        );
        this.set(
            out,
            smart,
            PbxServiceMonthFieldCode.degree_need,
            `${f.degreeNeed} %`,
        );
        if (f.dateNextCall) {
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.date_next_call,
                f.dateNextCall,
            );
        }
        if (f.dateNextEdu) {
            this.set(
                out,
                smart,
                PbxServiceMonthFieldCode.date_next_edu,
                f.dateNextEdu,
            );
        }
    }

    private queueAddOrUpdate(
        ctx: CallEventContext,
        smart: IPSmart,
        title: string,
        fields: Record<string, SmartFieldValue>,
    ): void {
        const entityTypeId = String(smart.entityTypeId);
        const existing = ctx.init.existingSmarts.find(s => s.title === title);
        if (existing?.id) {
            this.bitrix.batch.item.update(
                `update_smart_${existing.id}`,
                existing.id,
                smart.entityTypeId as unknown as BitrixOwnerTypeId.DEAL,
                fields as unknown as Partial<IBXItem>,
            );
        } else {
            this.bitrix.batch.item.add(
                `add_smart_${title}`,
                entityTypeId,
                fields as unknown as Partial<IBXItem>,
            );
        }
    }

    private set(
        out: Record<string, SmartFieldValue>,
        smart: IPSmart,
        code: PbxServiceMonthFieldCode,
        value: SmartFieldValue,
    ): void {
        const field = this.portal.getSmartFieldByCode(smart, code);
        if (!field?.bitrixId) return;
        out[field.bitrixId] = value;
    }

    private firstValue(
        multi: { VALUE: string; TYPE: string }[] | undefined,
    ): string {
        return multi?.[0]?.VALUE ?? '';
    }
}
