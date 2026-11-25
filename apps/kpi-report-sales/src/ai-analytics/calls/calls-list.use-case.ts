import { ForbiddenException, Injectable } from '@nestjs/common';
import { CallPageLeadService, CallPageLinkService } from '@lib/call-lib';
import {
    normalizeUserId,
    type RequesterAccess,
} from '../domain/access/perimeter.util';
import { CallClientTitlesService } from './call-client-titles.service';
import { CALLS_LIST_MESSAGES, CALLS_LIST_ROLES } from './calls-list.const';
import {
    badgeFacets,
    callTypesLockOf,
    filterByBadges,
    pointFacets,
    type CallListMainOverride,
} from './calls-list-badges.filter';
import {
    callListFacets,
    filterCallRows,
    pageOfRows,
    sortCallRows,
    visibleCallRows,
} from './calls-list.filter';
import { CallListIndexLoader } from './calls-list-index.loader';
import { pointIndexMap } from './calls-list-points.util';
import { CallListPointsProvider } from './calls-list-points.provider';
import { callListQueryOf, presentCallListItem } from './calls-list.presenter';
import type { CallListBadgeContext } from './calls-list.types';
import type { CallsListRequestDto } from './dto/calls-list-request.dto';
import type { CallsListResponseDto } from './dto/calls-list.dto';

/**
 * Набор «основных» бейджей портала (id общего бейджа или «m:» и код пункта).
 * Пока настроек портала нет — null: основные по справочнику бейджей и по
 * методике; позже набор придёт из настроек.
 */
const MAIN_BADGES_OVERRIDE: CallListMainOverride = null;

/** Раздел открыт руководителям по структуре и суперпользователю; иначе 403. */
export function assertCallsListAccess(access: RequesterAccess): void {
    const leader = (CALLS_LIST_ROLES as readonly string[]).includes(
        access.role,
    );
    if (!leader && access.isSuperUser !== true) {
        throw new ForbiddenException(CALLS_LIST_MESSAGES.leadersOnly);
    }
}

/**
 * Раздел «Разборы звонков» отчёта KPI: страница списка разборов за период
 * с фильтрами, порядком, фасетами и сводкой отзывов руководителей.
 *
 * Выборка периода общая на портал (кэш 5 минут), периметр пользователя,
 * фильтры, порядок и страница применяются к ней в памяти. Только на
 * строки страницы читаются клиенты звонков и выпускаются ссылки.
 * Менеджеру раздел закрыт (403) — отзывы руководителей он не видит.
 *
 * Бейджи звонков и пункты методики портала — фильтры поверх прочих: сначала
 * менеджеры, типы, оценка и отзывы (`base`), затем выбранные бейджи. Счётчики
 * бейджей и пунктов считаются по `base`: сколько звонков останется, если
 * добавить бейдж к выбранным.
 */
@Injectable()
export class CallsListUseCase {
    constructor(
        private readonly index: CallListIndexLoader,
        private readonly clients: CallClientTitlesService,
        private readonly links: CallPageLinkService,
        private readonly leads: CallPageLeadService,
        private readonly points: CallListPointsProvider,
    ) {}

    async execute(
        dto: CallsListRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<CallsListResponseDto> {
        assertCallsListAccess(access);
        const [index, portalPoints] = await Promise.all([
            this.index.load(dto.domain, dto.from, dto.to, now),
            this.points.forDomain(dto.domain),
        ]);
        const query = callListQueryOf(dto);
        const visible = visibleCallRows(index, access);
        const base = filterCallRows(visible, index.reviews, query);
        const badgeContext: CallListBadgeContext = {
            pointIndex: pointIndexMap(index.pointCodes),
            pointDefs: portalPoints.defs,
        };
        const matched = sortCallRows(
            filterByBadges(base, query, badgeContext),
            query.sort,
        );
        const rows = pageOfRows(matched, query.page, query.pageSize);
        const ids = rows.map(row => row.transcriptionId);
        const requesterId = normalizeUserId(dto.requesterUserId);
        const [clients, urls] = await Promise.all([
            this.clients.titlesFor(dto.domain, ids),
            this.urlsFor(dto.domain, ids, requesterId, access),
        ]);
        return {
            items: rows.map(row =>
                presentCallListItem(row, {
                    index,
                    requesterId,
                    clients,
                    urls,
                    points: badgeContext,
                    mainOverride: MAIN_BADGES_OVERRIDE,
                }),
            ),
            total: matched.length,
            page: query.page,
            pageSize: query.pageSize,
            facets: {
                ...callListFacets(visible, index.managerNames),
                badges: badgeFacets(
                    base,
                    query,
                    badgeContext,
                    MAIN_BADGES_OVERRIDE,
                ),
                points: pointFacets(
                    base,
                    query,
                    badgeContext,
                    MAIN_BADGES_OVERRIDE,
                ),
                methodology: portalPoints.methodology,
            },
            callTypesLock: callTypesLockOf(query.points, portalPoints.defs),
        };
    }

    /**
     * Личные ссылки руководителя с правом на отзыв (7 дней): все строки
     * списка — менеджеров из его периметра, значит право есть на каждую.
     * Роль в ключе — суперпользователь или руководитель; на сохранении она
     * всё равно перепроверяется. Id пользователя не число — обычные ссылки.
     */
    private urlsFor(
        domain: string,
        ids: readonly string[],
        requesterId: string | null,
        access: RequesterAccess,
    ): Promise<Map<string, string>> {
        if (requesterId === null) return this.links.urlsFor(domain, ids);
        return this.leads.urlsFor(domain, ids, {
            userId: requesterId,
            role: access.isSuperUser === true ? 'superuser' : 'leader',
        });
    }
}
