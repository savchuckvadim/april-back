import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { EventReportContext } from '../context/event-report.context';
import { EEventReportEntityType } from '../init/event-report-init.types';

/** `123` или `L_123` → 123; всё прочее — null. */
const toLeadId = (value: unknown): number | null => {
    if (value == null) return null;
    const match = /^(?:L_)?(\d+)$/.exec(
        String(value as string | number).trim(),
    );
    const id = match ? Number(match[1]) : 0;
    return id > 0 ? id : null;
};

const pushAll = (target: number[], raw: unknown): void => {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
        const id = toLeadId(value);
        if (id && !target.includes(id)) target.push(id);
    }
};

/**
 * Лиды, которые новая задача отчёта обязана нести в `UF_CRM_TASK` —
 * в порядке legacy и без повторов:
 *  1) лид, из которого открыли приложение;
 *  2) `L_*` текущей задачи — лид уже был в цепочке;
 *  3) лиды-первоисточники сделки-владельца: штатный LEAD_ID и наши поля
 *     графа deal_from_lead_id / deal_joined_leads;
 *  4) заявка, с которой менеджер связал презентацию (модалка перед
 *     отправкой);
 *  5) заявки, отмеченные чекбоксами «связано с этими заявками?».
 *
 * Требование «из лида видно, что происходит с работой». Живы ли эти лиды,
 * функция не знает — это проверяет {@link LiveLeadsReader}.
 */
export const collectTaskLeadIds = (
    ctx: EventReportContext,
    portal: PortalModel,
): number[] => {
    const ids: number[] = [];

    if (ctx.entityType === EEventReportEntityType.LEAD && ctx.entityId) {
        pushAll(ids, ctx.entityId);
    }

    const task = ctx.currentTask as unknown as Record<string, unknown> | null;
    const taskBindings = task?.ufCrmTask ?? task?.UF_CRM_TASK;
    if (Array.isArray(taskBindings)) {
        pushAll(
            ids,
            taskBindings.filter(
                (binding): binding is string =>
                    typeof binding === 'string' && binding.startsWith('L_'),
            ),
        );
    }

    const deal = ctx.ownerDeal as unknown as Record<string, unknown> | null;
    if (deal) {
        pushAll(ids, deal.LEAD_ID);
        for (const code of [
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
            PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
        ]) {
            const field = portal.getEntityFieldByCode('deal', code);
            if (!field) continue;
            pushAll(ids, deal[portal.getFieldBitrixId(field)]);
        }
    }

    if (ctx.dto.leadSync?.presentationLink) {
        pushAll(ids, ctx.dto.leadSync.leadId);
    }

    pushAll(ids, ctx.dto.plan?.relatedLeadIds ?? []);

    return ids;
};
