/**
 * Детерминированные ключи кэша/jobId KPI-отчёта и статистики звонков.
 *
 * Ключи строятся из НОРМАЛИЗОВАННОГО периода (normalizeReportPeriod):
 * легаси-запрос (DD.MM.YYYY) и каноничный (YYYY-MM-DD) за один и тот же
 * логический период дают ОДИН ключ и ОДИН job — дедупликация сквозная.
 * domain — обязательная часть jobId (изоляция порталов); в ключе кэша
 * domain добавляет сам AppCache.
 *
 * Схема ключа: `v1:result:{from}_{to}:{usersKey}` — будущие месячные
 * партиции лягут рядом (`v1:month:…`) без смены схемы.
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import { KPI_REPORT_CACHE_VERSION } from '../constants/report-queue.const';

/** Числовые userId: мусор отброшен, дедуп, сортировка; пусто → 'all'. */
export const buildReportUsersKey = (
    ids: readonly (string | number | null | undefined)[],
): string => {
    const normalized = [
        ...new Set(
            ids
                .map(id => Number(String(id ?? '').trim()))
                .filter(id => Number.isFinite(id) && id > 0),
        ),
    ].sort((a, b) => a - b);
    return normalized.length ? normalized.join('_') : 'all';
};

const buildResultKey = (
    fromIso: IsoDate,
    toIsoInclusive: IsoDate,
    usersKey: string,
): string =>
    `${KPI_REPORT_CACHE_VERSION}:result:${fromIso}_${toIsoInclusive}:${usersKey}`;

export const buildKpiReportResultKey = buildResultKey;
export const buildCallingStatResultKey = buildResultKey;

export const buildKpiReportJobId = (
    domain: string,
    fromIso: IsoDate,
    toIsoInclusive: IsoDate,
    usersKey: string,
): string =>
    `kpi-report:${KPI_REPORT_CACHE_VERSION}:${domain}:${fromIso}_${toIsoInclusive}:${usersKey}`;

export const buildCallingStatJobId = (
    domain: string,
    fromIso: IsoDate,
    toIsoInclusive: IsoDate,
    usersKey: string,
): string =>
    `calling-stat:${KPI_REPORT_CACHE_VERSION}:${domain}:${fromIso}_${toIsoInclusive}:${usersKey}`;

/**
 * Эхо-ключ запроса для фронта: `${from}|${to}|${usersKey}` — формат
 * finance/airtime-слайсов (отсев устаревших ответов и WS-событий).
 */
export const buildReportRequestKey = (
    fromIso: IsoDate,
    toIsoInclusive: IsoDate,
    usersKey: string,
): string => `${fromIso}|${toIsoInclusive}|${usersKey}`;
