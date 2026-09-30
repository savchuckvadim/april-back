import { ILeadToWorkItem } from '../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../services/lead-to-work-context.service';
import { xoPrevResponsible } from '../services/flows/lead-flow.service';

/** Что из подготовленного элемента пачки нужно для списка имён. */
export interface ILeadToWorkNameSource {
    item: Pick<ILeadToWorkItem, 'transferredBy' | 'excludeResponsible'>;
    leadContext?: Pick<
        LeadToWorkContext,
        'lead' | 'openTasks' | 'existingXoDeal'
    >;
    assignee?: { responsible: number | null };
}

/**
 * Все, чьи имена попадут в историю заявки и уведомления пачки, — их
 * резолвят ОДНИМ запросом до первой записи:
 *  - новый ответственный, сам передавший и исключённый SLA;
 *  - ответственный лида — «прежний» в уведомлении «работа ушла»;
 *  - прежний за обзвон ({@link xoPrevResponsible}) — «от кого» в «ХО
 *    передан: A → B»; без него эта сторона оставалась голым id.
 * Нули и повторы отсеивает резолвер.
 */
export function leadToWorkNameIds(
    entries: readonly ILeadToWorkNameSource[],
): number[] {
    return entries.flatMap(({ item, leadContext, assignee }) => [
        assignee?.responsible ?? 0,
        item.transferredBy ?? 0,
        item.excludeResponsible ?? 0,
        ...(leadContext
            ? [
                  Number(leadContext.lead.ASSIGNED_BY_ID) || 0,
                  xoPrevResponsible(leadContext) ?? 0,
              ]
            : []),
    ]);
}
