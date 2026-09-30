/**
 * Периметр строк обзора — «фильтр отчёта ∩ список разбора звонков»
 * (AiManagerScopeResolver) в презентере: сужение lite-строк до сотрудников
 * периметра и блок meta.scope. Чистые функции.
 */
import type {
    AiOverviewDto,
    AiOverviewScopeDto,
} from '../../dto/ai-overview.dto';
import type { AiManagerScope } from '../access/ai-manager-scope.util';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type {
    OverviewPresenterSources,
    OverviewScopeSource,
} from './overview-presenter.types';

/**
 * Lite-строки, по которым считается обзор: при заданном периметре —
 * звонки его сотрудников и звонки без сотрудника (они идут только в
 * meta.skippedNoManager); сотрудники вне фильтра и бывшие участники
 * разбора с разборами в окне не просачиваются ни в строки, ни в итоги.
 * Без периметра — все строки (прежнее поведение).
 */
export function scopeLiteRows(
    sources: Pick<OverviewPresenterSources, 'rows' | 'managerIds' | 'scope'>,
): DatedLiteRow[] {
    if (sources.scope === undefined) return sources.rows;
    const allowed = new Set(sources.managerIds.map(String));

    return sources.rows.filter(
        row => !row.managerId || allowed.has(row.managerId),
    );
}

/** Блок meta.scope: флаги периметра и число строк ответа. */
export function overviewScopeMeta(
    scope: OverviewScopeSource | undefined,
    shownManagers: number,
): AiOverviewScopeDto {
    return {
        pilotActive: scope?.pilotActive ?? false,
        shownManagers,
        hiddenByPilot: scope?.hiddenByPilot ?? 0,
    };
}

/**
 * meta.scope ответа по периметру ЗАПРОСА: кэш обзора общий для всех
 * фильтров с одним пересечением, а «сколько скрыто» зависит от фильтра.
 * Строки считаются после периметра requester'а.
 */
export function withOverviewScope(
    dto: AiOverviewDto,
    scope: Pick<AiManagerScope, 'pilotActive' | 'hiddenByPilot'>,
): AiOverviewDto {
    return {
        ...dto,
        meta: {
            ...dto.meta,
            scope: overviewScopeMeta(scope, dto.managers.length),
        },
    };
}
