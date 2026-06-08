import dayjs from 'dayjs';
import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBXListItemFields } from '@/modules/bitrix/domain/list-item/interface/bx-list-item.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
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
export class EventReportPresentationListService {
    private readonly logger = new Logger(
        EventReportPresentationListService.name,
    );

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext, deals: DealFlowResult): void {
        const list = this.portal.getListByCode('presentation');
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
        const nowLabel = dayjs(ctx.nowDate)
            .tz(this.portal.getTimezone())
            .format('DD.MM.YYYY HH:mm:ss');

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
                name: `Презентация не состоялась: ${ctx.reportComment || nowLabel}`,
            });
        }
        return items;
    }

    private buildFields(
        ctx: EventReportContext,
        deals: DealFlowResult,
        item: PresentationListItem,
    ): Record<string, unknown> {
        const tz = this.portal.getTimezone();
        const fields: Record<string, unknown> = {
            NAME: item.name,
        };
        const list = this.portal.getListByCode('presentation');
        if (!list) return fields;

        const set = (code: string, value: unknown) => {
            const field = this.portal.getIdByCodeFieldList(list, code);
            if (field?.bitrixCamelId) {
                fields[field.bitrixCamelId] = value;
            }
        };

        set(
            'date_event',
            dayjs(ctx.nowDate).tz(tz).format('DD.MM.YYYY HH:mm:ss'),
        );
        set('event_action', item.action);
        set('event_type', 'presentation');
        set('responsible', ctx.planResponsibleId);
        set('comment', ctx.reportComment);
        const crm: Record<string, string> = {};
        let i = 0;
        const pushCrm = (v: string) => {
            crm[`n${i++}`] = v;
        };
        if (ctx.entityType === 'company' && ctx.entityId) {
            pushCrm(`CO_${ctx.entityId}`);
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
