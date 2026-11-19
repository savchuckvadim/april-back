/**
 * Запрос и строка раздела «Разборы звонков»: значения по умолчанию для
 * фильтров и сборка строки ответа. Чистые функции.
 */
import { adminPageBounds } from '@lib/call-lib/admin-list/admin-list.util';
import { callTypeTitle } from '../call-page/call-page-titles.util';
import { CALLS_LIST_PAGE_LIMITS } from './calls-list.const';
import { summarizeCallReviews } from './calls-list.filter';
import type {
    CallListIndex,
    CallListQuery,
    CallListRow,
} from './calls-list.types';
import type { CallsListRequestDto } from './dto/calls-list-request.dto';
import type { CallsListItemDto } from './dto/calls-list.dto';

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
        url: urls.get(row.transcriptionId) ?? null,
    };
}
