import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import { mergeTaskCrmBindings } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    clearDealAssignedAt,
    setDealAcceptedBy,
    stampDealAssignedAt,
} from '../../../../shared/lead-request/deal-work-timer.util';
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
            Object.assign(fields, this.moneyFields(ctx, row));
            /*
             * ХО ЗАБИРАЕТ клиента: сделка переходит новому ответственному,
             * таймер подтверждения стартует заново (todo2508: assigned_at
             * живёт и на сделке; снимает его принятие работы), а стадия
             * ОБНУЛЯЕТСЯ до холодной либо «Новой» — как решил stageMode.
             *
             * Стадия двигается ТОЛЬКО в ХО-ветке, и это разделение смысловое
             * (решение владельца 13.09.2026):
             *  - isXo=N — это ПЕРЕЕЗД лида в работу: клиент продолжает с той
             *    стадии, на которой стоял, обнулять чужой прогресс нельзя;
             *  - isXo=Y — это холодный старт из лида, ровно как классический
             *    ХО: прежняя работа обнуляется, клиент начинает заново.
             *
             * Закрытую сделку сюда не пускает DealConsolidationService
             * (pickMain берёт только открытые), поэтому «оживить» выигранную
             * сделку этим нельзя.
             */
            if (item.isXo === 'Y') {
                Object.assign(
                    fields,
                    this.responsibleFields('deal', item.responsible),
                );
                if (plan.dealStageId) {
                    fields.STAGE_ID = plan.dealStageId;
                }
                this.stampWaiting(item, fields);
            } else if (item.stageMode !== 'from_lead' && plan.dealStageId) {
                /*
                 * Переезд стадию не трогает — но если робот явно просил
                 * cold/new, он вправе знать, что просьба не выполнена.
                 * Молчание здесь уже приводило к «передал stageMode=new, а
                 * сделка осталась в Переговорах».
                 */
                this.logger.warn(
                    `[deal] лид ${item.leadId}: stageMode=${item.stageMode} ` +
                        'проигнорирован — существующая сделка ' +
                        `${dealId} при isXo=N стадию не меняет`,
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
            TITLE: toBatchSafeText(eventName),
            CATEGORY_ID: plan.dealCategoryId,
            ...this.responsibleFields('deal', item.responsible),
            ...this.dealLinkFields(item.leadId, null),
            ...this.eventFields(eventCtx, 'deal', null),
        };
        if (plan.dealStageId) fields.STAGE_ID = plan.dealStageId;
        if (companyRef) fields.COMPANY_ID = companyRef;
        // Новая сделка из ХО-лида ждёт подтверждения ответственным —
        // тот же таймер, что при передаче работы (todo2508); адресный ХО
        // подтверждения не ждёт (см. stampWaiting).
        if (item.isXo === 'Y') this.stampWaiting(item, fields);
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
        Object.assign(fields, this.moneyFields(ctx, null));

        buffer.queue(() => this.bitrix.batch.deal.set(cmd, fields as never));
        return { ref: `$result[${cmd}]`, cmd };
    }

    /**
     * СУММА лида → сделка (решение владельца 15.09.2026, массовый
     * перенос: «давай сумму хотя бы если есть — переносим»).
     *
     * `IS_MANUAL_OPPORTUNITY: Y` обязателен: без него Битрикс пересчитает
     * OPPORTUNITY из товарных строк — и как только строки на сделке
     * появятся (руками менеджера или следующим этапом переноса), сумма,
     * ради которой всё делалось, обнулится. Тот же приём применён в
     * sales-base-deal.service для продажи.
     *
     * Валюта переносится вместе с суммой: без неё Битрикс возьмёт
     * валюту портала по умолчанию, и цифра поменяет смысл.
     *
     * У СУЩЕСТВУЮЩЕЙ сделки сумма перезаписывается ТОЛЬКО если она
     * пуста: там уже могла быть цифра, которую посчитал менеджер, и
     * затирать её лидом нельзя.
     */
    private moneyFields(ctx: LeadToWorkContext, dealRow: BxRow | null): BxRow {
        const lead = ctx.lead as unknown as BxRow | null;
        const amount = Number(lead?.OPPORTUNITY ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) return {};
        if (dealRow && Number(dealRow.OPPORTUNITY ?? 0) > 0) return {};

        const fields: BxRow = {
            OPPORTUNITY: String(amount),
            IS_MANUAL_OPPORTUNITY: 'Y',
        };
        const currency = this.text(lead?.CURRENCY_ID);
        if (currency) fields.CURRENCY_ID = currency;
        return fields;
    }

    /**
     * Ожидание подтверждения на сделке — или его отсутствие.
     *
     * Круг: сотрудник обязан подтвердить, что берёт заявку, — ставим таймер
     * (SLA считает от него). Адресный ХО: сотрудника назвали явно, заявка
     * считается принятой им сразу — таймер снимаем и пишем «кто принял»,
     * ровно как делает кнопка «принять» (решение владельца 18–21.09.2026).
     */
    private stampWaiting(item: ResolvedLeadToWorkItem, fields: BxRow): void {
        if (item.addressed) {
            clearDealAssignedAt(this.portal, fields);
            setDealAcceptedBy(this.portal, fields, item.responsible);
            return;
        }
        stampDealAssignedAt(this.portal, fields, this.portal.getTimezone());
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
        baseDealRef: string | null,
    ): DealFlowResult {
        if (item.isXo !== 'Y') return { ref: null };

        if (ctx.existingXoDeal) {
            const row = ctx.existingXoDeal as unknown as BxRow;
            const xoId = String(row.ID);
            const cmd = `lw_xo_upd_${item.leadId}`;
            const fields: BxRow = {
                ...this.responsibleFields('deal', item.responsible),
                ...this.dealLinkFields(item.leadId, row),
                ...this.baseDealLink(baseDealRef),
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
            TITLE: toBatchSafeText(xoTitle),
            CATEGORY_ID: plan.xoCategoryId,
            ...this.responsibleFields('deal', item.responsible),
            ...this.dealLinkFields(item.leadId, null),
            ...this.baseDealLink(baseDealRef),
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
    /**
     * Ссылка ХО-сделки на КОРНЕВУЮ основную (`to_base_sales`).
     *
     * Без неё пара «основная ↔ ХО» существует только на словах: сборщик
     * связей ищет ХО-работу клиента именно по этому полю, а менеджер не
     * видит в карточке обзвона, к какой продаже тот относится. Классический
     * ХО-хук поле пишет всегда — здесь его просто забыли, и связь молча
     * не появлялась (сделка 25543, 13.09.2026).
     *
     * ССЫЛКА В BATCH. Значением идёт либо реальный id уже существующей
     * основной, либо токен `$result[lw_deal_…]` сделки, создаваемой в ЭТОМ
     * ЖЕ батче — Битрикс подставляет токен и в UF-поле. Готовое значение
     * приходит из `queueBase`, здесь его не собирают заново.
     *
     * Формат — голый id, как в классическом ХО-хуке (ColdDealFlowService):
     * поле разрешает единственный тип DEAL. Разрешай оно несколько,
     * понадобился бы префикс `D_`, и Битрикс молча не сохранил бы
     * значение, не ругнувшись.
     */
    private baseDealLink(baseDealRef: string | null): BxRow {
        if (!baseDealRef) return {};
        const name = this.dealFieldName(
            PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
        );
        return name ? { [name]: baseDealRef } : {};
    }

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
