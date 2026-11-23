import { APP_LOGS_TABLE } from '../../transports/clickhouse.transport';
import {
    LOG_AT_EXPR,
    LOG_WINDOW,
    logFilterConditions,
    LogSql,
    logWhere,
} from '../log-query.sql';
import { BitrixFailureFilter } from './bitrix-failures.types';

/**
 * SQL журнала сбоев Битрикса. Значения — только параметрами `{name:Type}`;
 * пути в meta — константы контракта с писателем (libs/bitrix core/failure).
 */

const FAILURE = "'bitrixFailure'";
const CONTEXT = "'callContext'";

const HAS_FAILURE = `JSONHas(meta, ${FAILURE})`;
const WRITE_EXPR = `JSONExtractBool(meta, ${FAILURE}, 'write')`;
const OPERATION_EXPR = `JSONExtractString(meta, ${CONTEXT}, 'operation')`;

/** Окно, наличие записи о сбое, приложение и портал (общий фильтр журналов). */
function failureConditions(
    filter: BitrixFailureFilter,
    params: LogSql['params'],
): string[] {
    return [
        LOG_WINDOW,
        HAS_FAILURE,
        ...logFilterConditions(
            { hours: filter.hours, app: filter.app, domain: filter.domain },
            params,
        ),
    ];
}

/** Последние сбои, новые сверху; «только запись» — по флагу фильтра. */
export function buildBitrixFailureRowsSql(
    filter: BitrixFailureFilter,
    limit: number,
): LogSql {
    const params: LogSql['params'] = { hours: filter.hours, limit };
    const conditions = failureConditions(filter, params);
    if (filter.writeOnly) conditions.push(`${WRITE_EXPR} = 1`);
    return {
        query: `SELECT ${LOG_AT_EXPR} AS at, app,
       JSONExtractString(meta, 'domain') AS domain,
       JSONExtractString(meta, ${FAILURE}, 'kind') AS kind,
       JSONExtractString(meta, ${FAILURE}, 'method') AS method,
       ${WRITE_EXPR} AS write,
       JSONExtractString(meta, ${FAILURE}, 'commands', 'summary') AS commands,
       JSONExtractUInt(meta, ${FAILURE}, 'commands', 'total') AS commandsTotal,
       JSONExtractString(meta, ${FAILURE}, 'entity', 'label') AS targetLabel,
       JSONExtractString(meta, ${FAILURE}, 'entity', 'id') AS targetId,
       JSONExtractUInt(meta, ${FAILURE}, 'status') AS status,
       JSONExtractString(meta, ${FAILURE}, 'error') AS error,
       ${OPERATION_EXPR} AS operation,
       JSONExtractString(meta, ${CONTEXT}, 'source') AS source,
       JSONExtractString(meta, ${CONTEXT}, 'entity', 'type') AS entityType,
       JSONExtractString(meta, ${CONTEXT}, 'entity', 'id') AS entityId,
       JSONExtractUInt(meta, ${CONTEXT}, 'actor', 'userId') AS actorId,
       JSONExtractString(meta, ${CONTEXT}, 'actor', 'name') AS actorName
FROM ${APP_LOGS_TABLE}
${logWhere(conditions)}
ORDER BY timestamp DESC
LIMIT {limit:UInt32}`,
        params,
    };
}

/**
 * Счёт сбоев записи и чтения по паре «приложение × операция» — из него
 * собирается сводка. «Только запись» сюда не идёт: сводка показывает обе
 * стороны, чтобы было видно долю записи.
 */
export function buildBitrixFailureCountsSql(
    filter: BitrixFailureFilter,
    top: number,
): LogSql {
    const params: LogSql['params'] = { hours: filter.hours, top };
    return {
        query: `SELECT app, ${OPERATION_EXPR} AS operation,
       countIf(${WRITE_EXPR} = 1) AS writes,
       countIf(${WRITE_EXPR} = 0) AS reads
FROM ${APP_LOGS_TABLE}
${logWhere(failureConditions(filter, params))}
GROUP BY app, operation
ORDER BY writes DESC, reads DESC
LIMIT {top:UInt32}`,
        params,
    };
}
