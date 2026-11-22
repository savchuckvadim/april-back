import { Injectable } from '@nestjs/common';
import { LogQueryRepository } from '../log-query.repository';
import { normalizeLogFilter, normalizeLogLimit } from '../log-query.service';
import {
    buildBitrixFailureCountsSql,
    buildBitrixFailureRowsSql,
} from './bitrix-failures.sql';
import {
    buildBitrixFailureSummary,
    toBitrixFailureCount,
    toBitrixFailureRow,
} from './bitrix-failures.mapper';
import {
    BitrixFailureFilter,
    BitrixFailuresView,
} from './bitrix-failures.types';

/** Сколько пар «приложение × операция» читать для сводки. */
const COUNTS_TOP = 500;

/**
 * Журнал сбоев Битрикса для админки: что не записалось (или не прочиталось)
 * окончательно — по порталу, приложению и операции. Только чтение
 * ClickHouse, тем же подключением, что общие журналы.
 */
@Injectable()
export class BitrixFailureQueryService {
    constructor(private readonly repository: LogQueryRepository) {}

    async journal(
        filter: BitrixFailureFilter,
        limit?: number,
        now: Date = new Date(),
    ): Promise<BitrixFailuresView> {
        const { hours, app, domain } = normalizeLogFilter(filter);
        const normalized: BitrixFailureFilter = {
            hours,
            app,
            domain,
            writeOnly: filter.writeOnly === true,
        };
        const [rows, counts] = await Promise.all([
            this.repository.select(
                buildBitrixFailureRowsSql(normalized, normalizeLogLimit(limit)),
            ),
            this.repository.select(
                buildBitrixFailureCountsSql(normalized, COUNTS_TOP),
            ),
        ]);
        return {
            summary: buildBitrixFailureSummary(
                counts.map(toBitrixFailureCount),
                hours,
                now,
            ),
            rows: rows.map(toBitrixFailureRow),
        };
    }
}
