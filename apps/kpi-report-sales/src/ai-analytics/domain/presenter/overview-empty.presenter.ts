/**
 * Пустой обзор для пустого периметра — в фильтре отчёта нет ни одного
 * сотрудника из разбора звонков (решение владельца: ready без джобы).
 * Строк нет, итоги по типам справочника нулевые, meta.scope называет
 * причину. Собирается тем же buildOverviewDto на пустых источниках: форма
 * ответа та же, что у настоящего обзора.
 *
 * Загрузчики с пустым managerIds не зовутся вовсе: для KPI, финансов и
 * планов пусто означает «весь ростер» — ровно то, чего периметр не должен
 * показывать. Готовность считается по пустому набору разборов; для баннера
 * витрина берёт готовность из settings/get.
 */
import { SALES_HOT_THRESHOLDS } from '../../../sales-finance/constants/sales-finance.const';
import { normalizeReportPeriod } from '../../../shared/lib/date-util';
import { AI_ANALYTICS_HOT_STAGE_CODE } from '../../constants/ai-overview.const';
import type { AiOverviewDto } from '../../dto/ai-overview.dto';
import type { AiManagerScope } from '../access/ai-manager-scope.util';
import type { AiAnalyticsPortalSettings } from '../loaders/settings.loader';
import { buildOverviewDto } from './overview.presenter';

/** Что известно без загрузчиков: период, настройки портала и периметр. */
export interface EmptyOverviewInput {
    domain: string;
    from: string;
    to: string;
    confirmedOnly: boolean;
    settings: Pick<
        AiAnalyticsPortalSettings,
        'calendar' | 'enabled' | 'rosterConfirmedAt' | 'hypothesis'
    >;
    scope: Pick<AiManagerScope, 'pilotActive' | 'hiddenByPilot'>;
}

export function buildEmptyOverviewDto(
    input: EmptyOverviewInput,
    now: Date,
): AiOverviewDto {
    const { from, to, settings } = input;
    // Границы периода в том же виде, в каком их отдают загрузчики.
    const period = normalizeReportPeriod(from, to);
    const bounds = { from: period.fromIso, to: period.toIsoInclusive };

    return buildOverviewDto(
        {
            domain: input.domain,
            from,
            to,
            confirmedOnly: input.confirmedOnly,
            calendar: settings.calendar,
            enabled: settings.enabled,
            managerIds: [],
            rows: [],
            kpi: { ...bounds, managerIds: [], months: [] },
            finance: {
                ...bounds,
                managerIds: [],
                pipelineThreshold: SALES_HOT_THRESHOLDS[0],
                hotStageCode: AI_ANALYTICS_HOT_STAGE_CODE,
                months: [],
                pipeline: { fromCache: false, managers: [] },
                managers: [],
            },
            plans: {
                managerIds: [],
                fromCache: false,
                ok: true,
                error: null,
                managers: [],
            },
            org: new Map(),
            levels: new Map(),
            disagreementsCount: 0,
            rosterConfirmedAt: settings.rosterConfirmedAt,
            hypothesisPairs: settings.hypothesis?.pairs.length ?? 0,
            scope: {
                pilotActive: input.scope.pilotActive,
                hiddenByPilot: input.scope.hiddenByPilot,
            },
        },
        now,
    );
}
