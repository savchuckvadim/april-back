/**
 * Запрос и строка раздела «Разборы звонков»: значения по умолчанию для
 * фильтров и сборка строки ответа. Чистые функции.
 */
import { adminPageBounds } from '@lib/call-lib/admin-list/admin-list.util';
import { CALL_BADGES } from '@lib/sales-ai-analytics';
import { callTypeTitle } from '../call-page/call-page-titles.util';
import {
    CALLS_LIST_PAGE_LIMITS,
    CALLS_LIST_POINT_BADGE_PREFIX,
} from './calls-list.const';
import { summarizeCallReviews } from './calls-list.filter';
import {
    isMainPoint,
    type CallListMainOverride,
} from './calls-list-badges.filter';
import { pointStatusAt } from './calls-list-points.util';
import type {
    CallListBadgeContext,
    CallListIndex,
    CallListPointFilter,
    CallListQuery,
    CallListRow,
} from './calls-list.types';
import type { CallsListItemBadgeDto } from './dto/calls-list-badges.dto';
import type { CallsListRequestDto } from './dto/calls-list-request.dto';
import type { CallsListItemDto } from './dto/calls-list.dto';

/** Бейджи пунктов методики: на один код — один, побеждает последний. */
function dedupePointFilters(
    points: readonly CallListPointFilter[],
): CallListPointFilter[] {
    const byCode = new Map<string, CallListPointFilter>();
    for (const { code, state } of points) byCode.set(code, { code, state });
    return [...byCode.values()];
}

/** Фильтры запроса с значениями по умолчанию; границы оценки — по порядку. */
export function callListQueryOf(dto: CallsListRequestDto): CallListQuery {
    const { page, pageSize } = adminPageBounds(dto, CALLS_LIST_PAGE_LIMITS);
    const bounds = [dto.scoreMin ?? null, dto.scoreMax ?? null];
    const [scoreMin, scoreMax] =
        bounds[0] !== null && bounds[1] !== null && bounds[0] > bounds[1]
            ? [bounds[1], bounds[0]]
            : bounds;
    return {
        managerIds: (dto.managerIds ?? []).map(id => String(Number(id))),
        callTypes: dto.callTypes ?? [],
        scoreMin,
        scoreMax,
        review: dto.review ?? 'any',
        badges: [...new Set(dto.badges ?? [])],
        points: dedupePointFilters(dto.points ?? []),
        sort: dto.sort ?? 'date_desc',
        page,
        pageSize,
    };
}

/** Что нужно строке, кроме самой строки выборки. */
export interface CallListItemContext {
    index: CallListIndex;
    requesterId: string | null;
    clients: ReadonlyMap<string, string>;
    urls: ReadonlyMap<string, string>;
    /** Пункты методики портала и позиции кодов в выборке. */
    points: CallListBadgeContext;
    /** «Основные» бейджи портала; null — по справочнику и методике. */
    mainOverride: CallListMainOverride;
}

/**
 * Бейджи строки: общие бейджи-проблемы звонка (по порядку справочника), затем
 * основные пункты методики, не исполненные в этом звонке (по порядку методики).
 */
export function presentItemBadges(
    row: CallListRow,
    context: Pick<CallListItemContext, 'points' | 'mainOverride'>,
): CallsListItemBadgeDto[] {
    const problems = CALL_BADGES.filter(
        def => def.problem && row.badges.includes(def.id),
    ).map(def => ({ id: def.id, title: def.title, tone: def.tone }));
    const { pointIndex, pointDefs } = context.points;
    const missed = pointDefs
        .filter(def => {
            const index = pointIndex.get(def.code);
            return (
                isMainPoint(def, context.mainOverride) &&
                index !== undefined &&
                pointStatusAt(row.points, index) === 'missed'
            );
        })
        .map(def => ({
            id: `${CALLS_LIST_POINT_BADGE_PREFIX}${def.code}`,
            title: def.label,
            tone: 'warn' as const,
        }));
    return [...problems, ...missed];
}

/** Строка ответа из строки выборки. */
export function presentCallListItem(
    row: CallListRow,
    context: CallListItemContext,
): CallsListItemDto {
    const { index, requesterId, clients, urls } = context;
    return {
        transcriptionId: row.transcriptionId,
        startedAt: row.startedAt,
        managerId: row.managerId,
        managerName:
            row.managerId === null
                ? null
                : (index.managerNames[row.managerId] ?? null),
        durationSec: row.durationSec,
        callType: row.callType,
        callTypeTitle: callTypeTitle(row.callType),
        aiScore: row.aiScore,
        client: clients.get(row.transcriptionId) ?? null,
        reviews: summarizeCallReviews(
            index.reviews[row.transcriptionId] ?? [],
            requesterId,
        ),
        badges: presentItemBadges(row, context),
        url: urls.get(row.transcriptionId) ?? null,
    };
}
