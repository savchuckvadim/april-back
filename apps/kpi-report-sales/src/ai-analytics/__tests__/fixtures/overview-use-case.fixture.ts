import type { DatedLiteRow } from '../../domain/loaders/lite-row.mapper';
import type { AiAnalyticsPortalSettings } from '../../domain/loaders/settings.loader';
import { OverviewUseCase } from '../../domain/use-cases/overview.use-case';
import { callsLoaderWith, settingsLoaderWith } from './lite-row.fixture';
import { scopeResolverWith } from './manager-scope.fixture';
import {
    emptyFinance,
    emptyKpi,
    emptyPlans,
    twoManagersRows,
} from './overview.fixture';
import { smartLinksWith } from './smart-links.fixture';

/** Реакция внутри периода обзора (10.08–06.09). */
export const OVERVIEW_FEEDBACK_AT = new Date('2026-09-01T10:00:00Z');

export interface OverviewUseCaseOptions {
    rows?: DatedLiteRow[];
    /** Ростер ОП по структуре (нужен, когда нет ни фильтра, ни списка разбора). */
    roster?: number[];
    /** Реакций disagree внутри периода. */
    disagreements?: number;
    /** Настройки портала: список разбора (callReport), порог длительности. */
    settings?: Partial<AiAnalyticsPortalSettings>;
}

/**
 * OverviewUseCase на моках загрузчиков: звонки — lite-строки, KPI,
 * финансы и планы пустые (вызовы записываются), периметр — настоящий
 * AiManagerScopeResolver над моком ростера.
 */
export function makeOverviewUseCase(options: OverviewUseCaseOptions = {}) {
    const roster = options.roster ?? [10, 20];
    const calls = callsLoaderWith(options.rows ?? twoManagersRows());
    const scope = scopeResolverWith(roster);
    const kpi = {
        loadKpiMonths: jest.fn().mockResolvedValue(emptyKpi(roster)),
    };
    const finance = {
        loadFinance: jest.fn().mockResolvedValue(emptyFinance(roster)),
    };
    const plans = {
        loadPlans: jest.fn().mockResolvedValue(emptyPlans(roster)),
    };
    const org = { load: jest.fn().mockResolvedValue(new Map()) };
    const levels = {
        loadLevels: jest
            .fn()
            .mockResolvedValue(
                new Map([
                    [10, { managerId: 10, level: 'senior', since: null }],
                ]),
            ),
    };
    const feedback = {
        listInPeriod: jest.fn().mockResolvedValue(
            Array.from({ length: options.disagreements ?? 0 }, (_, index) => ({
                id: String(index),
                kind: 'disagree',
                object: 'call:x',
                managerId: '10',
                transcriptionId: null,
                requesterUserId: null,
                reason: null,
                createdAt: OVERVIEW_FEEDBACK_AT,
            })),
        ),
    };
    const useCase = new OverviewUseCase(
        settingsLoaderWith(options.settings ?? {}),
        scope.resolver,
        calls.loader,
        kpi as never,
        finance as never,
        plans as never,
        org as never,
        levels as never,
        feedback as never,
        smartLinksWith().loader,
    );

    return {
        useCase,
        calls,
        roster: scope.roster,
        kpi,
        finance,
        plans,
        org,
        feedback,
    };
}
