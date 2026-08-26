import { mergeTaskCrmBindings } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { stampDealAssignedAt } from '../../../../shared/lead-request/deal-work-timer.util';
import { IBatchGroupBuffer } from '../../../../shared/batch/batch-group-buffer.interface';
import { ResolvedLeadToWorkItem } from '../../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../lead-to-work-context.service';
import { LeadToWorkStagePlan } from '../lead-to-work-stage.resolver';
import { IXoEventContext } from '../models/xo-event-entity.model';
import { BxRow, LeadToWorkFlowBase } from './lead-to-work-flow.base';

/** Итог по одной сделке: ссылка для связей + ключ команды. */
export interface DealFlowResult {
    /** `123` (reuse) либо `$result[cmd]` (создание); null — сделки нет. */
    ref: string | null;
    cmd?: string;
}

/**
 * Сделки хука «лид → работа»: основная сделка ОП и ХО-сделка.
 *
 * Обе ветки идемпотентны: существующая сделка НЕ дублируется, а доводится
 * (связи графа, событийные поля, ответственный при передаче). Связи
 * `deal_from_lead_id` + `deal_joined_leads` пишутся на ЛЮБУЮ нашу сделку —
 * правило пользователя «у любой связанной сделки видно, из какого лида».
 */
export class DealFlowService extends LeadToWorkFlowBase {
    /** Основная сделка ОП: reuse существующей либо создание новой. */
    queueBase(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        eventName: string,
        companyRef: string | null,
        eventCtx: IXoEventContext | null,
        buffer: IBatchGroupBuffer,
    ): DealFlowResult {
        if (ctx.existingOurDeal) {
            const row = ctx.existingOurDeal as unknown as BxRow;
            const dealId = String(row.ID);
            const cmd = `lw_deal_upd_${item.leadId}`;
            const fields: BxRow = {
                ...this.dealLinkFields(item.leadId, row),
                ...this.eventFields(eventCtx, 'deal', row),
            };
            if (companyRef && !this.text(row.COMPANY_ID)) {
                fields.COMPANY_ID = companyRef;
            }
            // Контакты лида доводим и на существующую сделку, но не затираем
            // уже привязанные: у неё могли появиться свои (union).
            const mergedContacts = this.mergeContacts(
                this.refList(row.CONTACT_IDS).map(Number),
                ctx.contactIds,
            );
            if (mergedContacts.length) fields.CONTACT_IDS = mergedContacts;
            // Повторный ХО передаёт работу: сделка — новому ответственному,
            // таймер подтверждения стартует заново (todo2508: assigned_at
            // живёт и на сделке; снимает его принятие работы).
            if (item.isXo === 'Y') {
                fields.ASSIGNED_BY_ID = String(item.responsible);
                stampDealAssignedAt(
                    this.portal,
                    fields,
                    this.portal.getTimezone(),
                );
            }
            buffer.queue(() =>
                this.bitrix.batch.deal.update(
                    cmd,
                    Number(dealId),
                    fields as never,
                ),
            );
            return { ref: dealId, cmd };
        }

        const cmd = `lw_deal_${item.leadId}`;
        const fields: BxRow = {
            TITLE: eventName,
            CATEGORY_ID: plan.dealCategoryId,
            ASSIGNED_BY_ID: String(item.responsible),
            ...this.dealLinkFields(item.leadId, null),
            ...this.eventFields(eventCtx, 'deal', null),
        };
        if (plan.dealStageId) fields.STAGE_ID = plan.dealStageId;
        if (companyRef) fields.COMPANY_ID = companyRef;
        // Новая сделка из ХО-лида сразу ждёт подтверждения ответственным —
        // тот же таймер, что при передаче работы (todo2508).
        if (item.isXo === 'Y') {
            stampDealAssignedAt(this.portal, fields, this.portal.getTimezone());
        }
        /*
         * Контакты лида переезжают на сделку целиком: главный — в
         * CONTACT_ID (по нему Битрикс показывает «контакт сделки»),
         * все — в CONTACT_IDS. Иначе при переходе в работу терялись бы
         * телефоны, по которым и звонят.
         */
        if (ctx.contactIds.length) {
            fields.CONTACT_ID = String(ctx.contactIds[0]);
            fields.CONTACT_IDS = ctx.contactIds;
        }

        buffer.queue(() => this.bitrix.batch.deal.set(cmd, fields as never));
        return { ref: `$result[${cmd}]`, cmd };
    }

    /** Union контактов с сохранением порядка (главный лида — первым). */
    private mergeContacts(current: number[], fromLead: number[]): number[] {
        const merged: number[] = [];
        for (const id of [...current, ...fromLead]) {
            if (Number.isFinite(id) && id > 0 && !merged.includes(id)) {
                merged.push(id);
            }
        }
        return merged;
    }

    /**
     * ХО-сделка (только isXo=Y). Повторный ХО существующую сделку не
     * плодит, а ПЕРЕДАЁТ новому ответственному; смежные сделки не
     * закрываются — это делает инвариант «одна пара» до записи.
     */
    queueXo(
        item: ResolvedLeadToWorkItem,
        ctx: LeadToWorkContext,
        plan: LeadToWorkStagePlan,
        xoTitle: string,
        companyRef: string | null,
        eventCtx: IXoEventContext | null,
        buffer: IBatchGroupBuffer,
    ): DealFlowResult {
        if (item.isXo !== 'Y') return { ref: null };

        if (ctx.existingXoDeal) {
            const row = ctx.existingXoDeal as unknown as BxRow;
            const xoId = String(row.ID);
            const cmd = `lw_xo_upd_${item.leadId}`;
            const fields: BxRow = {
                ASSIGNED_BY_ID: String(item.responsible),
                ...this.dealLinkFields(item.leadId, row),
                ...this.eventFields(eventCtx, 'deal', row),
            };
            buffer.queue(() =>
                this.bitrix.batch.deal.update(
                    cmd,
                    Number(xoId),
                    fields as never,
                ),
            );
            return { ref: xoId, cmd };
        }

        if (!plan.xoCategoryId) return { ref: null };
        const cmd = `lw_xo_${item.leadId}`;
        const fields: BxRow = {
            TITLE: xoTitle,
            CATEGORY_ID: plan.xoCategoryId,
            ASSIGNED_BY_ID: String(item.responsible),
            ...this.dealLinkFields(item.leadId, null),
            // Событийные поля обзвона — как у ХО-сделки классического хука.
            ...this.eventFields(eventCtx, 'deal', null),
        };
        if (plan.xoStageId) fields.STAGE_ID = plan.xoStageId;
        if (companyRef) fields.COMPANY_ID = companyRef;
        // ХО-сделка — та же работа: контакты лида нужны и в ней (по ним звонят).
        if (ctx.contactIds.length) {
            fields.CONTACT_ID = String(ctx.contactIds[0]);
            fields.CONTACT_IDS = ctx.contactIds;
        }
        buffer.queue(() => this.bitrix.batch.deal.set(cmd, fields as never));
        return { ref: `$result[${cmd}]`, cmd };
    }

    /**
     * Наши поля-связи, обязательные для ЛЮБОЙ связанной сделки (основной И
     * ХО): deal_from_lead_id = лид-первоисточник, deal_joined_leads = union
     * с текущим значением сделки. Отсутствующее на портале поле — скип.
     *
     * Плюс ШТАТНОЕ поле `LEAD_ID`: по нему Битрикс сам рисует связь с лидом
     * в карточке сделки (без него наши UF-связи видит только приложение).
     * У существующей сделки не перетираем: там может стоять лид штатной
     * конвертации, и он первичнее нашего.
     */
    private dealLinkFields(leadId: number, existingRow: BxRow | null): BxRow {
        const fields: BxRow = {};
        if (!existingRow || !this.text(existingRow.LEAD_ID)) {
            fields.LEAD_ID = String(leadId);
        }
        const fromLeadName = this.dealFieldName(
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
        );
        if (fromLeadName) {
            fields[fromLeadName] = `L_${leadId}`;
        }
        const joinedName = this.dealFieldName(
            PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
        );
        if (joinedName) {
            const current = existingRow
                ? this.refList(existingRow[joinedName])
                : [];
            fields[joinedName] = mergeTaskCrmBindings(current, [`L_${leadId}`]);
        }
        return fields;
    }
}
