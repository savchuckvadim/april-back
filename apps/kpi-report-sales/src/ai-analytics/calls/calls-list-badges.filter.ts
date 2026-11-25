/**
 * Фильтры и фасеты бейджей раздела «Разборы звонков»: общие бейджи звонка
 * и бейджи пунктов методики портала. Чистые функции: справочник пунктов и
 * набор «основных» бейджей приходят параметрами.
 *
 * Правила сочетания:
 * - бейджи без семейства — «и»: звонок должен нести все выбранные;
 * - бейджи одного семейства (итог разговора) — «или» внутри семейства;
 *   семейства и остальные бейджи между собой — «и»;
 * - пункт методики — «и» со всем остальным: у звонка пункт ровно в том
 *   состоянии, что выбрано (исполнен / не исполнен); не проверялся, не
 *   относится к разговору или неизвестен выборке — звонок не подходит.
 */
import { matchesGroups, type ConditionGroup } from '@lib/shared/lib/list-query';
import {
    CALL_BADGE_FAMILIES,
    CALL_BADGES,
    callBadgeDef,
    type CallBadgeId,
} from '@lib/sales-ai-analytics';
import { CALLS_LIST_POINT_BADGE_PREFIX } from './calls-list.const';
import type {
    CallListBadgeContext,
    CallListBadgeFacet,
    CallListPointDef,
    CallListPointFacet,
    CallListPointFilter,
    CallListQuery,
    CallListRow,
} from './calls-list.types';
import { pointStatusAt } from './calls-list-points.util';

export type {
    CallListBadgeContext,
    CallListBadgeFacet,
    CallListPointDef,
    CallListPointFacet,
} from './calls-list.types';

/** Выбранные бейджи запроса. */
export type CallListBadgeSelection = Pick<CallListQuery, 'badges' | 'points'>;

/**
 * Набор «основных» бейджей портала: id общего бейджа или «m:» и код пункта;
 * null — основные по справочнику и по методике.
 */
export type CallListMainOverride = ReadonlySet<string> | null;

const hasBadge =
    (id: CallBadgeId) =>
    (row: CallListRow): boolean =>
        row.badges.includes(id);

/** Условие по пункту: статус звонка ровно такой, как выбран; код неизвестен выборке — никто не подходит. */
const pointTest =
    (filter: CallListPointFilter, pointIndex: ReadonlyMap<string, number>) =>
    (row: CallListRow): boolean => {
        const index = pointIndex.get(filter.code);
        return (
            index !== undefined &&
            pointStatusAt(row.points, index) === filter.state
        );
    };

/** Группы условий: бейджи без семейства — «и», каждое семейство — «или», пункты — «и». */
function conditionGroups(
    selection: CallListBadgeSelection,
    pointIndex: ReadonlyMap<string, number>,
): ConditionGroup<CallListRow>[] {
    const withFamily = (family: string | null): CallBadgeId[] =>
        selection.badges.filter(id => callBadgeDef(id).family === family);
    return [
        { mode: 'all', tests: withFamily(null).map(hasBadge) },
        ...CALL_BADGE_FAMILIES.map(
            (family): ConditionGroup<CallListRow> => ({
                mode: 'any',
                tests: withFamily(family).map(hasBadge),
            }),
        ),
        {
            mode: 'all',
            tests: selection.points.map(filter =>
                pointTest(filter, pointIndex),
            ),
        },
    ];
}

/** Строки, подходящие под выбранные бейджи и пункты методики. */
export function filterByBadges(
    rows: readonly CallListRow[],
    selection: CallListBadgeSelection,
    context: Pick<CallListBadgeContext, 'pointIndex'>,
): CallListRow[] {
    const groups = conditionGroups(selection, context.pointIndex);
    return rows.filter(row => matchesGroups(row, groups));
}

/**
 * Типы звонка, к которым относятся выбранные пункты методики, — пересечение
 * типов пунктов, у которых есть описание. Описанных выбранных пунктов нет —
 * null (типы не ограничены); пересечение пустое — пустой список.
 */
export function callTypesLockOf(
    points: readonly CallListPointFilter[],
    defs: readonly CallListPointDef[],
): string[] | null {
    const defByCode = new Map(
        defs.map((def): [string, CallListPointDef] => [def.code, def]),
    );
    const selected = points
        .map(point => defByCode.get(point.code))
        .filter((def): def is CallListPointDef => def !== undefined);
    if (selected.length === 0) return null;
    return selected
        .slice(1)
        .reduce(
            (lock, def) => lock.filter(type => def.callTypes.includes(type)),
            [...selected[0].callTypes],
        );
}

/** Общий бейдж основной: по справочнику или по набору портала. */
export function isMainBadge(
    id: CallBadgeId,
    mainOverride: CallListMainOverride,
): boolean {
    return mainOverride === null ? callBadgeDef(id).main : mainOverride.has(id);
}

/** Пункт методики основной: по методике или по набору портала («m:» и код). */
export function isMainPoint(
    def: CallListPointDef,
    mainOverride: CallListMainOverride,
): boolean {
    return mainOverride === null
        ? def.main
        : mainOverride.has(`${CALLS_LIST_POINT_BADGE_PREFIX}${def.code}`);
}

/** Сколько строк несёт каждый из бейджей `ids`. */
function countBadges(
    rows: readonly CallListRow[],
    ids: readonly CallBadgeId[],
): Map<CallBadgeId, number> {
    const counts = new Map<CallBadgeId, number>(
        ids.map((id): [CallBadgeId, number] => [id, 0]),
    );
    for (const row of rows) {
        for (const id of row.badges) {
            const count = counts.get(id);
            if (count !== undefined) counts.set(id, count + 1);
        }
    }
    return counts;
}

/**
 * Фасеты общих бейджей — все бейджи справочника по порядку. Счётчик — сколько
 * звонков `base` (уже прошедших прочие фильтры) останется, если добавить
 * бейдж к выбранным:
 * - бейдж без семейства — прошедшие весь выбор и несущие бейдж;
 * - бейдж семейства — прошедшие выбор без выбранных бейджей этого же
 *   семейства (выбор внутри семейства — «или», бейдж заменяет его) и
 *   несущие бейдж.
 */
export function badgeFacets(
    base: readonly CallListRow[],
    selection: CallListBadgeSelection,
    context: Pick<CallListBadgeContext, 'pointIndex'>,
    mainOverride: CallListMainOverride,
): CallListBadgeFacet[] {
    const allIds = CALL_BADGES.map(def => def.id);
    const idsOf = (family: string | null): CallBadgeId[] =>
        allIds.filter(id => callBadgeDef(id).family === family);
    const counts = countBadges(
        filterByBadges(base, selection, context),
        idsOf(null),
    );
    for (const family of CALL_BADGE_FAMILIES) {
        const withoutFamily: CallListBadgeSelection = {
            ...selection,
            badges: selection.badges.filter(
                id => callBadgeDef(id).family !== family,
            ),
        };
        const familyCounts = countBadges(
            filterByBadges(base, withoutFamily, context),
            idsOf(family),
        );
        for (const [id, count] of familyCounts) counts.set(id, count);
    }
    return CALL_BADGES.map(def => ({
        id: def.id,
        title: def.title,
        hint: def.hint,
        tone: def.tone,
        family: def.family,
        main: isMainBadge(def.id, mainOverride),
        since: def.since,
        count: counts.get(def.id) ?? 0,
    }));
}

/**
 * Фасеты пунктов методики — все пункты `context.pointDefs` по порядку.
 * «Исполнен» и «не исполнен» — сколько звонков `base` останется, если
 * выбрать пункт в этом состоянии при прочих выбранных фильтрах (собственный
 * выбранный фильтр по этому пункту не учитывается).
 */
export function pointFacets(
    base: readonly CallListRow[],
    selection: CallListBadgeSelection,
    context: CallListBadgeContext,
    mainOverride: CallListMainOverride,
): CallListPointFacet[] {
    const selected = filterByBadges(base, selection, context);
    return context.pointDefs.map(def => {
        const chosen = selection.points.some(point => point.code === def.code);
        const rows = chosen
            ? filterByBadges(
                  base,
                  {
                      ...selection,
                      points: selection.points.filter(
                          point => point.code !== def.code,
                      ),
                  },
                  context,
              )
            : selected;
        const index = context.pointIndex.get(def.code);
        let done = 0;
        let missed = 0;
        if (index !== undefined) {
            for (const row of rows) {
                const status = pointStatusAt(row.points, index);
                if (status === 'done') done += 1;
                else if (status === 'missed') missed += 1;
            }
        }
        return {
            code: def.code,
            label: def.label,
            title: def.title,
            callTypes: [...def.callTypes],
            main: isMainPoint(def, mainOverride),
            done,
            missed,
        };
    });
}
