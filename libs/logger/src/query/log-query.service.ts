import { Injectable } from '@nestjs/common';
import { buildLogConclusions } from './log-conclusions';
import { LogQueryRepository } from './log-query.repository';
import {
    LOG_QUERY_HOURS,
    LOG_QUERY_ROWS,
    LogQueryFilter,
    LogRowView,
    LogSummary,
} from './log-query.types';

/** Сколько частых ошибок и порталов в сводке. */
const SUMMARY_TOP = { errors: 15, domains: 20 } as const;

const clampInt = (
    value: number,
    min: number,
    max: number,
    fallback: number,
) => {
    const int = Math.floor(Number(value));
    if (!Number.isFinite(int) || int < min) return fallback;
    return Math.min(max, int);
};

/** Окно и пустые строки — к одному виду; домен — без протокола и пути. */
export function normalizeLogFilter(filter: LogQueryFilter): LogQueryFilter {
    const clean = (value?: string) => value?.trim() || undefined;
    const domain = clean(filter.domain)
        ?.toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
    return {
        hours: clampInt(
            filter.hours,
            LOG_QUERY_HOURS.min,
            LOG_QUERY_HOURS.max,
            LOG_QUERY_HOURS.fallback,
        ),
        app: clean(filter.app),
        env: clean(filter.env),
        level: filter.level,
        domain: domain || undefined,
        search: clean(filter.search),
    };
}

/**
 * Журналы всех приложений для админки и ИИ: строки по фильтру и сводка с
 * выводами (по приложениям, частым ошибкам, порталам).
 */
@Injectable()
export class LogQueryService {
    constructor(private readonly repository: LogQueryRepository) {}

    async rows(filter: LogQueryFilter, limit?: number): Promise<LogRowView[]> {
        return this.repository.rows(
            normalizeLogFilter(filter),
            clampInt(
                limit ?? LOG_QUERY_ROWS.fallback,
                1,
                LOG_QUERY_ROWS.max,
                LOG_QUERY_ROWS.fallback,
            ),
        );
    }

    async summary(
        filter: LogQueryFilter,
        now: Date = new Date(),
    ): Promise<LogSummary> {
        const normalized = normalizeLogFilter(filter);
        const [apps, topErrors, domains] = await Promise.all([
            this.repository.apps(normalized),
            this.repository.topErrors(normalized, SUMMARY_TOP.errors),
            this.repository.domains(normalized, SUMMARY_TOP.domains),
        ]);
        return {
            hours: normalized.hours,
            from: new Date(
                now.getTime() - normalized.hours * 3_600_000,
            ).toISOString(),
            to: now.toISOString(),
            apps,
            topErrors,
            domains,
            conclusions: buildLogConclusions({
                hours: normalized.hours,
                apps,
                topErrors,
                domains,
            }),
        };
    }
}
