/**
 * Проблемные сделки последней ночи (п. 2 постановки §7): отбор по
 * периметру, менеджерам и статусам, порядок по убыванию суммы и страница —
 * на сервере. Чистые функции над записью ночного счёта.
 */
import {
    DEAL_MOVEMENT_STATUS_TITLES,
    type DealMovementAlarmStatus,
    type DealMovementDealsSnapshotPayload,
    type DealMovementProblemDeal,
} from '@lib/sales-ai-analytics';
import type { DealMovementScope } from './deal-movement-scope';
import {
    DEAL_MOVEMENT_PAGE_LIMITS,
    DEAL_MOVEMENT_TEXTS,
} from './deal-movement-vitrina.const';
import type {
    DealMovementDealItemDto,
    DealMovementDealsPageDto,
} from './dto/deal-movement-deals.dto';

/** Запрос страницы в разрешённом виде. */
export interface DealMovementDealsQuery {
    readonly statuses: readonly DealMovementAlarmStatus[] | null;
    readonly page: number;
    readonly pageSize: number;
}

/** Страница и размер из запроса: по умолчанию 1 и 25, размер не выше потолка. */
export function dealMovementDealsQueryOf(dto: {
    statuses?: DealMovementAlarmStatus[];
    page?: number;
    pageSize?: number;
}): DealMovementDealsQuery {
    const pageSize = Math.min(
        DEAL_MOVEMENT_PAGE_LIMITS.maxPageSize,
        Math.max(1, dto.pageSize ?? DEAL_MOVEMENT_PAGE_LIMITS.defaultPageSize),
    );
    return {
        statuses: dto.statuses?.length ? dto.statuses : null,
        page: Math.max(1, dto.page ?? 1),
        pageSize,
    };
}

const amountOf = (deal: DealMovementProblemDeal): number => deal.amount ?? 0;

/** По сумме, при равной — дольше в стадии, затем по номеру сделки. */
const byAmount = (
    a: DealMovementProblemDeal,
    b: DealMovementProblemDeal,
): number =>
    amountOf(b) - amountOf(a) ||
    b.daysInStage - a.daysInStage ||
    Number(a.dealId) - Number(b.dealId);

const dealUrl = (domain: string, dealId: string): string =>
    `https://${domain}/crm/deal/details/${dealId}/`;

function itemOf(
    deal: DealMovementProblemDeal,
    domain: string,
    names: Readonly<Record<string, string>>,
): DealMovementDealItemDto {
    return {
        dealId: deal.dealId,
        url: dealUrl(domain, deal.dealId),
        title: deal.title,
        managerId: deal.managerId,
        managerName:
            deal.managerId === null ? null : (names[deal.managerId] ?? null),
        status: deal.status,
        statusTitle: DEAL_MOVEMENT_STATUS_TITLES[deal.status],
        amount: deal.amount,
        stageTitle: deal.stageTitle,
        stageCode: deal.stageCode,
        daysInStage: deal.daysInStage,
        stageLimitDays: deal.stageLimitDays,
        stageLimitSource: deal.stageLimitSource,
        reasons: deal.reasons,
        since: deal.since,
    };
}

/** Пустая страница: списка ещё нет. */
export function emptyDealMovementDealsPage(
    query: DealMovementDealsQuery,
): DealMovementDealsPageDto {
    return {
        day: null,
        generatedAt: null,
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
        perGroup: 0,
        groups: [],
        limited: false,
        note: DEAL_MOVEMENT_TEXTS.noDeals,
    };
}

/** Страница списка по записи ночи, периметру и фильтрам. */
export function presentDealMovementDeals(input: {
    record: DealMovementDealsSnapshotPayload;
    domain: string;
    scope: DealMovementScope;
    query: DealMovementDealsQuery;
    names: Readonly<Record<string, string>>;
}): DealMovementDealsPageDto {
    const { record, scope, query } = input;
    const keep = (item: {
        managerId: string | null;
        status: DealMovementAlarmStatus;
    }): boolean =>
        scope.visible(item.managerId) &&
        (query.statuses === null || query.statuses.includes(item.status));
    const matched = record.deals.filter(keep).sort(byAmount);
    const start = (query.page - 1) * query.pageSize;
    const groups = record.groups.filter(keep).map(group => ({ ...group }));
    return {
        day: record.day,
        generatedAt: record.generatedAt || null,
        items: matched
            .slice(start, start + query.pageSize)
            .map(deal => itemOf(deal, input.domain, input.names)),
        total: matched.length,
        page: query.page,
        pageSize: query.pageSize,
        perGroup: record.perGroup,
        groups,
        limited: groups.some(group => group.total > group.shown),
        note: null,
    };
}
