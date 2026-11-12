import { IBXStatus } from '@/modules/bitrix';
import { Stage } from '@app/pbx-install/shared';
import { toSort } from '../shared/utils/bitrix-category-stage.utils';

/** Как ставить SORT при поштучной синхронизации стадии. */
export interface StageSortPlan {
    /** SORT синхронизируемой стадии. */
    sort: number;
    /** Пересчитывать ли SORT соседей по порядку шаблона. */
    reorderNeighbours: boolean;
    /** Почему пересчёт соседей не делается (для ответа операции); null — делается или не просили. */
    reorderSkipped: string | null;
}

export interface StageSortPlanInput {
    stage: Stage;
    templateStages: readonly Stage[];
    /** Справочник Bitrix воронки ДО применения стадии. */
    rows: readonly IBXStatus[];
    /** Полный STATUS_ID по суффиксу шаблона (`NOT_CA` → `C97:NOT_CA`). */
    statusIdOf: (bitrixId: string) => string;
    reorder: boolean;
}

/**
 * SORT поштучно синхронизируемой стадии.
 *
 * Порядок шаблона (`order`) — это ПОРЯДОК, а не SORT портала. Порталы
 * нумеруют стадии по-своему: gsr — шагом 10 («Успех» 130, «Не ЦА» 160) и с
 * собственными стадиями («Прозвон», «Дозвон», «Не трогать»). Раньше SORT
 * брался прямо из `order` (16 у «Дубля»): отказная стадия вставала в
 * начало воронки раньше успешной, и Битрикс отвечал 400 (gsr 12.11.2026).
 * А пересчёт соседей по шаблону (1…16) вынес бы стадии портала за «Успех».
 *
 * Правило:
 *  - своих стадий у портала нет и пересчёт просили — как раньше: шаблон
 *    главный, SORT = order, соседи пересчитываются;
 *  - иначе стадия встаёт МЕЖДУ соседями по их фактическому SORT (ближайшая
 *    стадия шаблона до неё и после неё, которые есть на портале), соседи
 *    не трогаются.
 */
export function planSingleStageSort(input: StageSortPlanInput): StageSortPlan {
    const targetId = input.statusIdOf(String(input.stage.bitrixId));
    const templateIds = new Set(
        input.templateStages.map(s => input.statusIdOf(String(s.bitrixId))),
    );
    const ownStages = input.rows.filter(
        row =>
            row.STATUS_ID &&
            row.STATUS_ID !== targetId &&
            !templateIds.has(row.STATUS_ID),
    );

    if (input.reorder && !ownStages.length) {
        return {
            sort: toSort(input.stage.order),
            reorderNeighbours: true,
            reorderSkipped: null,
        };
    }
    return {
        sort: sortBetweenNeighbours(input, targetId),
        reorderNeighbours: false,
        reorderSkipped: input.reorder
            ? 'в воронке есть стадии портала вне шаблона (' +
              ownStages.map(row => row.NAME || row.STATUS_ID).join(', ') +
              ') — порядок соседей не меняется, стадия встала между ними'
            : null,
    };
}

function sortBetweenNeighbours(
    input: StageSortPlanInput,
    targetId: string,
): number {
    const ladder = [...input.templateStages].sort(
        (a, b) => Number(a.order) - Number(b.order),
    );
    const index = ladder.findIndex(s => s.code === input.stage.code);
    const sortOf = (stage: Stage): number | null => {
        const id = input.statusIdOf(String(stage.bitrixId));
        if (id === targetId) return null;
        const row = input.rows.find(r => r.STATUS_ID === id);
        const sort = Number(row?.SORT);
        return row && Number.isFinite(sort) ? sort : null;
    };

    let before: number | null = null;
    for (let i = index - 1; i >= 0 && before === null; i--) {
        before = sortOf(ladder[i]);
    }
    let after: number | null = null;
    for (
        let i = index + 1;
        index >= 0 && i < ladder.length && after === null;
        i++
    ) {
        after = sortOf(ladder[i]);
    }

    if (before !== null && after !== null) {
        return after - before > 1
            ? Math.floor((before + after) / 2)
            : before + 1;
    }
    if (before !== null) return before + 1;
    if (after !== null) return Math.max(after - 1, 1);
    return toSort(input.stage.order);
}
