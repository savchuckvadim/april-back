import { bxFieldId } from '@lib/shared/lib/utils';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';
import { LeadToWorkContext } from '../services/lead-to-work-context.service';
import { xoPrevResponsible } from '../services/flows/lead-flow.service';

/** Что из подготовленного элемента пачки нужно для списка имён. */
export interface ILeadToWorkNameSource {
    item: Pick<ILeadToWorkItem, 'transferredBy' | 'excludeResponsible'>;
    leadContext?: Pick<
        LeadToWorkContext,
        'openTasks' | 'existingXoDeal' | 'convertedDeals' | 'fromLeadDeals'
    >;
    assignee?: { responsible: number | null };
}

/**
 * Все, чьи имена попадут в историю заявки и уведомления пачки, — их
 * резолвят ОДНИМ запросом до первой записи:
 *  - новый ответственный, сам передавший и исключённый SLA;
 *  - прежний за обзвон ({@link xoPrevResponsible}) — «от кого» в «ХО
 *    передан: A → B»; без него эта сторона оставалась голым id;
 *  - ответственные всех сделок-кандидатов лида: консолидация может
 *    выбрать основной ХО-сделкой другую, и «от кого» возьмётся из неё.
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
                  xoPrevResponsible(leadContext) ?? 0,
                  ...[
                      leadContext.existingXoDeal,
                      ...leadContext.convertedDeals,
                      ...leadContext.fromLeadDeals,
                  ].map(deal =>
                      deal ? (bxFieldId(deal.ASSIGNED_BY_ID) ?? 0) : 0,
                  ),
              ]
            : []),
    ]);
}
