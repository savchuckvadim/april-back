import { AiManagerScopeResolver } from '../../domain/access/ai-manager-scope.resolver';
import { normalizeManagerIds } from '../../domain/loaders/managers.loader';
import type {
    AiAnalyticsPortalSettings,
    AiCallReportStatus,
} from '../../domain/loaders/settings.loader';
import { settingsLoaderWith } from './lite-row.fixture';

/** Статус разбора звонков: по умолчанию включён, со списком пилота. */
export function callReportWith(
    pilotUserIds: number[] | null,
    enabled = true,
): AiCallReportStatus {
    return { enabled, pilotUserIds, salesOnly: true, minDurationSec: null };
}

export interface ScopeResolverHarness {
    resolver: AiManagerScopeResolver;
    /** Мок ManagersLoader.resolve: явные id — нормализуются, без них — ростер. */
    roster: jest.Mock<Promise<number[]>, [string, (string | number)[]?]>;
    /** Мок кэша: публикация периметра без фильтра. */
    setJson: jest.Mock<Promise<void>, [string, unknown, number]>;
}

/**
 * Настоящий резолвер периметра вкладки AI: ростер ОП и кэш — моки,
 * список разбора — из настроек портала (callReport). Настройки нужны
 * только ручке resolve; resolveFor получает статус параметром.
 */
export function scopeResolverWith(
    roster: number[] = [10, 20],
    settings: Partial<AiAnalyticsPortalSettings> = {},
): ScopeResolverHarness {
    const rosterMock = jest.fn<
        Promise<number[]>,
        [string, (string | number)[]?]
    >((_domain, ids) =>
        Promise.resolve(ids?.length ? normalizeManagerIds(ids) : roster),
    );
    const setJson = jest
        .fn<Promise<void>, [string, unknown, number]>()
        .mockResolvedValue(undefined);
    const resolver = new AiManagerScopeResolver(
        settingsLoaderWith(settings),
        { resolve: rosterMock } as never,
        { setJson } as never,
    );

    return { resolver, roster: rosterMock, setJson };
}
