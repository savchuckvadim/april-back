import { APP_LOGS_TABLE } from '../transports/clickhouse.transport';
import { LogQueryFilter } from './log-query.types';

/**
 * SQL чтения журналов ClickHouse. Значения — только через параметры
 * `{name:Type}` (query_params клиента), в текст запроса не подставляются.
 *
 * Регулярки без обратных слешей (`[.]`, `[0-9]`): так текст запроса не
 * зависит от правил экранирования строк ClickHouse и TypeScript.
 */

export interface LogSql {
    query: string;
    params: Record<string, string | number>;
}

/** Портал строки: `domain` в meta, иначе адрес портала Битрикс24 в тексте. */
export const LOG_DOMAIN_EXPR =
    "if(JSONExtractString(meta, 'domain') != '', JSONExtractString(meta, 'domain'), " +
    "extract(message, '([a-z0-9-]+[.]bitrix24[.][a-z]+)'))";

/** Время строки в ISO-подобном виде (UTC): сериализация не зависит от клиента. */
const AT_EXPR = "formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ')";

const WINDOW = 'timestamp >= now64(3) - toIntervalHour({hours:UInt32})';

/** Условия фильтра, кроме окна времени. */
function filterConditions(
    filter: LogQueryFilter,
    params: LogSql['params'],
): string[] {
    const conditions: string[] = [];
    if (filter.app) {
        params.app = filter.app;
        conditions.push('app = {app:String}');
    }
    if (filter.env) {
        params.env = filter.env;
        conditions.push('env = {env:String}');
    }
    if (filter.level) {
        params.level = filter.level;
        conditions.push('level = {level:String}');
    }
    if (filter.domain) {
        params.domain = filter.domain;
        conditions.push(
            "(JSONExtractString(meta, 'domain') = {domain:String} OR positionCaseInsensitive(message, {domain:String}) > 0)",
        );
    }
    if (filter.search) {
        params.search = filter.search;
        conditions.push(
            'positionCaseInsensitive(message, {search:String}) > 0',
        );
    }
    return conditions;
}

const where = (conditions: string[]): string =>
    conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

/** Последние строки журнала по фильтру. */
export function buildRowsSql(filter: LogQueryFilter, limit: number): LogSql {
    const params: LogSql['params'] = { hours: filter.hours, limit };
    const conditions = [WINDOW, ...filterConditions(filter, params)];
    return {
        query: `SELECT ${AT_EXPR} AS at, app, env, level, context, message, meta,
       substring(trace, 1, 4000) AS trace, ${LOG_DOMAIN_EXPR} AS domain
FROM ${APP_LOGS_TABLE}
${where(conditions)}
ORDER BY timestamp DESC
LIMIT {limit:UInt32}`,
        params,
    };
}

/**
 * Приложения за окно и предыдущее такое же окно (одним запросом): всплески
 * ошибок и «замолчавшие» приложения. Фильтр уровня сюда не идёт — счёт по
 * уровням внутри.
 */
export function buildAppsSql(filter: LogQueryFilter): LogSql {
    const params: LogSql['params'] = { hours: filter.hours };
    const conditions = [
        'timestamp >= now64(3) - toIntervalHour({hours:UInt32} * 2)',
        ...filterConditions({ ...filter, level: undefined }, params),
    ];
    const current = 'timestamp >= now64(3) - toIntervalHour({hours:UInt32})';
    return {
        query: `SELECT app,
       countIf(level = 'error' AND ${current}) AS errors,
       countIf(level = 'warn' AND ${current}) AS warnings,
       countIf(${current}) AS total,
       countIf(level = 'error' AND NOT ${current}) AS prevErrors,
       countIf(NOT ${current}) AS prevTotal,
       formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.%fZ') AS lastAt
FROM ${APP_LOGS_TABLE}
${where(conditions)}
GROUP BY app
ORDER BY errors DESC, total DESC`,
        params,
    };
}

/** Повторяющиеся ошибки: текст без чисел — один шаблон. */
export function buildTopErrorsSql(filter: LogQueryFilter, top: number): LogSql {
    const params: LogSql['params'] = { hours: filter.hours, top };
    const conditions = [
        WINDOW,
        ...filterConditions({ ...filter, level: undefined }, params),
    ];
    params.patternLevel = filter.level ?? 'error';
    conditions.push('level = {patternLevel:String}');
    return {
        query: `SELECT app,
       replaceRegexpAll(substring(message, 1, 160), '[0-9]+', '#') AS pattern,
       any(substring(message, 1, 500)) AS sample,
       count() AS count,
       formatDateTime(min(timestamp), '%Y-%m-%dT%H:%i:%S.%fZ') AS firstAt,
       formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.%fZ') AS lastAt,
       groupUniqArray(6)(${LOG_DOMAIN_EXPR}) AS domains
FROM ${APP_LOGS_TABLE}
${where(conditions)}
GROUP BY app, pattern
ORDER BY count DESC
LIMIT {top:UInt32}`,
        params,
    };
}

/** Порталы: где больше всего ошибок и предупреждений. */
export function buildDomainsSql(filter: LogQueryFilter, top: number): LogSql {
    const params: LogSql['params'] = { hours: filter.hours, top };
    const conditions = [
        WINDOW,
        ...filterConditions({ ...filter, level: undefined }, params),
        `${LOG_DOMAIN_EXPR} != ''`,
    ];
    return {
        query: `SELECT ${LOG_DOMAIN_EXPR} AS domain,
       countIf(level = 'error') AS errors,
       countIf(level = 'warn') AS warnings,
       count() AS total
FROM ${APP_LOGS_TABLE}
${where(conditions)}
GROUP BY domain
ORDER BY errors DESC, warnings DESC, total DESC
LIMIT {top:UInt32}`,
        params,
    };
}
