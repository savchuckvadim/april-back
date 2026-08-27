import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBXListItemFields } from '@/modules/bitrix/domain/list-item/interface/bx-list-item.interface';
import { toBatchText } from '@lib/bitrix/consts/batch.consts';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import { EEventReportEntityType } from '../init/event-report-init.types';
import { DealFlowResult } from '../deal/event-report-deal-flow.service';

type PresentationAction = 'plan' | 'done' | 'expired' | 'fail';

interface PresentationListItem {
    action: PresentationAction;
    name: string;
}

/**
 * Отдельный список «Презентации» — детальная история каждой презентации,
 * не KPI/History.
 *
 * Сценарии (см. event-report-service-map.md «Блок 5»):
 *  - plan — запланирована (planType=presentation && !isExpired);
 *  - report done — состоялась (isPresentationDone);
 *  - report expired — перенос (reportType=presentation && isExpired);
 *  - report fail — не состоялась/отказ (reportType=presentation && isFail).
 *
 * Bitrix list-item add: пишем поля как `PROPERTY_<bitrixCamelId>` если они
 * сконфигурированы. Если списка нет — мягко выходим.
 */
/**
 * @deprecated НЕ ПОДКЛЮЧЁН к flow (решение владельца 27.08).
 *
 * Список «ОП Презентации» ведёт легаси-хук на Laravel, и там он
 * работает. Запись из april-next дала бы ВТОРУЮ запись о той же
 * презентации. Новый контур ведёт смарт «Презентации»
 * (apps/event-sales/src/presentation-flow) — он и заменит список
 * целиком, см. front/docs/presentation-unification.md.
 *
 * Код оставлен как справка о составе полей списка (и на случай
 * отключения легаси-хука), а не как рабочий путь.
 */
export class EventReportPresentationListService {
    private readonly logger = new Logger(
        EventReportPresentationListService.name,
    );

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext, deals: DealFlowResult): void {
        const list = this.portal.getListByCode('sales_presentation');
        if (!list) {
            this.logger.warn('presentation list not configured on portal');
            return;
        }

        const items = this.collectItems(ctx);
        if (items.length === 0) return;

        const suffix = `${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        items.forEach((item, idx) => {
            const code = `presentation_${ctx.entityId}_${suffix}_${idx}`;
            const fields = this.buildFields(ctx, deals, item);
            this.bitrix.batch.listItem.add(`add_pres_list_${idx}_${suffix}`, {
                IBLOCK_ID: String(list.bitrixId),
                ELEMENT_CODE: code,
                FIELDS: fields as IBXListItemFields,
            });
        });
    }

    private collectItems(ctx: EventReportContext): PresentationListItem[] {
        const items: PresentationListItem[] = [];
        const nowLabel = ctx.dateTime.crmDateTime(ctx.nowDate);

        if (ctx.planEventType === 'presentation' && !ctx.isExpired) {
            items.push({
                action: 'plan',
                name: `Запланирована презентация: ${ctx.planEventName || nowLabel}`,
            });
        }
        if (ctx.isPresentationDone && !ctx.isExpired) {
            items.push({
                action: 'done',
                name: `Презентация состоялась: ${ctx.reportEventName || nowLabel}`,
            });
        }
        if (ctx.reportEventType === 'presentation' && ctx.isExpired) {
            items.push({
                action: 'expired',
                name: `Перенос презентации: ${nowLabel}`,
            });
        }
        if (ctx.reportEventType === 'presentation' && ctx.isFail) {
            items.push({
                action: 'fail',
                // NAME элемента однострочный по природе — многострочный
                // комментарий менеджера схлопываем в одну строку, иначе
                // сырой \n batch-команды доехал бы подчёркиваниями.
                name: `Презентация не состоялась: ${
                    ctx.reportComment.replace(/\s+/g, ' ').trim() || nowLabel
                }`,
            });
        }
        return items;
    }

    private buildFields(
        ctx: EventReportContext,
        deals: DealFlowResult,
        item: PresentationListItem,
    ): Record<string, unknown> {
        const fields: Record<string, unknown> = {
            NAME: item.name,
        };
        const list = this.portal.getListByCode('sales_presentation');
        if (!list) return fields;

        const set = (code: string, value: unknown) => {
            const field = this.portal.getIdByCodeFieldList(list, code);
            if (field?.bitrixCamelId) {
                fields[field.bitrixCamelId] = value;
            }
        };

        /*
         * Коды полей — из шаблона установки списка
         * (storage/app/install/data/sales/lists/sales-list-presentation.json):
         * все с префиксом `pres_`. Прежние короткие имена (`date_event`,
         * `responsible`, `comment`) не существуют ни на одном портале —
         * `set` молча пропускал их, и элемент уходил с одним лишь NAME.
         */
        set('pres_event_date', ctx.dateTime.crmDateTime(ctx.nowDate));
        set('pres_responsible', ctx.planResponsibleId);
        set('pres_plan_author', ctx.planCreatedById || ctx.planResponsibleId);
        // План и факт живут в РАЗНЫХ полях: смысл списка в том, чтобы
        // «когда назначили» и «когда провели» были видны раздельно.
        if (item.action === 'plan') {
            set('pres_plan_date', ctx.planDeadline?.toCrmDateTime() ?? null);
            // Комментарий уходит batch-командой (lists.element.add
            // строкой): сырой перенос доезжает подчёркиванием — только %0A.
            set('pres_plan_comment', toBatchText(ctx.reportComment));
        }
        if (item.action === 'done') {
            set('pres_done_date', ctx.dateTime.crmDateTime(ctx.nowDate));
            set('pres_done_comment', toBatchText(ctx.reportComment));
        }
        if (item.action === 'expired') {
            set('pres_pound_date', ctx.dateTime.crmDateTime(ctx.nowDate));
            set('pres_plan_date', ctx.planDeadline?.toCrmDateTime() ?? null);
        }
        if (item.action === 'fail') {
            set('pres_done_comment', toBatchText(ctx.reportComment));
        }
        const crm: Record<string, string> = {};
        let i = 0;
        const pushCrm = (v: string) => {
            crm[`n${i++}`] = v;
        };
        // Привязка к владельцу: раньше писалась только компания, и записи
        // лид-контекста оставались без хозяина — их нельзя было найти.
        if (ctx.entityType === EEventReportEntityType.COMPANY && ctx.entityId) {
            pushCrm(`CO_${ctx.entityId}`);
        }
        if (ctx.entityType === EEventReportEntityType.LEAD && ctx.entityId) {
            pushCrm(`L_${ctx.entityId}`);
        }
        if (ctx.entityType === EEventReportEntityType.DEAL && ctx.entityId) {
            pushCrm(`D_${ctx.entityId}`);
        }
        if (deals.newPlanPresDealId) {
            pushCrm(`D_${deals.newPlanPresDealId}`);
        }
        if (deals.newUnplannedPresDealId) {
            pushCrm(`D_${deals.newUnplannedPresDealId}`);
        }
        if (ctx.currentPresDeal) {
            pushCrm(`D_${ctx.currentPresDeal.ID}`);
        }
        set('crm', crm);
        return fields;
    }
}
