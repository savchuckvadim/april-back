import { bxFieldId } from '@lib/shared/lib/utils';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';
import { IRepeatResolution } from '../lib/repeat-work.resolver';
import { LeadToWorkContext } from '../services/lead-to-work-context.service';
import { xoPrevResponsible } from '../services/flows/lead-flow.service';

/** Решение по повторной заявке в объёме, нужном списку имён. */
type RepeatOwnersSource = {
    resolution: Pick<IRepeatResolution, 'mainDeal' | 'openDeals'>;
};

/** Что из подготовленного элемента пачки нужно для списка имён. */
export interface ILeadToWorkNameSource {
    item: Pick<ILeadToWorkItem, 'transferredBy' | 'excludeResponsible'>;
    leadContext?: Pick<
        LeadToWorkContext,
        'openTasks' | 'existingXoDeal' | 'convertedDeals' | 'fromLeadDeals'
    >;
    assignee?: { responsible: number | null };
    /** Повторная заявка, решённая к присоединению. */
    join?: { outcome: RepeatOwnersSource };
}

/**
 * Все, чьи имена попадут в историю заявки и уведомления пачки, — их
 * резолвят ОДНИМ запросом до первой записи:
 *  - новый ответственный, сам передавший и исключённый SLA;
 *  - прежний за обзвон ({@link xoPrevResponsible}) — «от кого» в «ХО
 *    передан: A → B»; без него эта сторона оставалась голым id;
 *  - ответственные всех сделок-кандидатов лида: консолидация может
 *    выбрать основной ХО-сделкой другую, и «от кого» возьмётся из неё;
 *  - повторная заявка: владельцы ВСЕХ открытых сделок клиента — они
 *    названы в комментариях и уведомлениях о присоединении, а в холостом
 *    ходе (`notes`) — в комментарии «присоединил бы…».
 * Нули и повторы отсеивает резолвер.
 */
export function leadToWorkNameIds(
    entries: readonly ILeadToWorkNameSource[],
    notes: readonly RepeatOwnersSource[] = [],
): number[] {
    return [
        ...entries.flatMap(({ item, leadContext, assignee, join }) => [
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
            ...(join ? repeatOwnerIds(join.outcome) : []),
        ]),
        ...notes.flatMap(repeatOwnerIds),
    ];
}

/** Владельцы выбранной и всех открытых сделок клиента. */
function repeatOwnerIds({ resolution }: RepeatOwnersSource): number[] {
    return [resolution.mainDeal, ...(resolution.openDeals ?? [])].map(
        deal => deal?.responsibleId ?? 0,
    );
}
