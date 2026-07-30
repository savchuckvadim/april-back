/**
 * Пагинированная выгрузка voximplant.statistic.get — общая для sync-режима
 * (AirtimeStatisticUseCase) и воркеров партиций.
 *
 * Громкая ошибка дропа: rate-limiter Битрикса под перегрузом дропает вызовы
 * ТИХО (fail-open), и страница приходит без поля result — раньше это давало
 * молча неполный отчёт (инцидент 2026-07-27). Теперь такая страница —
 * исключение: job падает и ретраится, sync-запрос отвечает 500 вместо
 * недостоверных цифр.
 */
import { Logger } from '@nestjs/common';
import { BitrixBaseApi } from '@lib/bitrix';
import {
    VoximplantAirtimeFilter,
    VoximplantAirtimeRow,
    VoximplantStatisticEnvelope,
} from '../types/airtime-statistic.type';

export const VOXIMPLANT_STATISTIC_METHOD = 'voximplant.statistic.get';

/** Страница статистики потеряна (дроп лимитера/обрыв) — отчёт был бы неполным. */
export class AirtimePageDroppedError extends Error {
    constructor(pageStart: number) {
        super(
            `${VOXIMPLANT_STATISTIC_METHOD}: страница (start=${pageStart}) ` +
                'потеряна — ответ Битрикс без поля result (дроп rate-limiter ' +
                'или обрыв). Отчёт был бы неполным, расчёт остановлен.',
        );
        this.name = 'AirtimePageDroppedError';
    }
}

export interface AirtimeFetchResult {
    rows: VoximplantAirtimeRow[];
    truncated: boolean;
}

/**
 * Фильтр выборки. userIds не передан — выборка по ВСЕМУ порталу
 * (воркер партиции: результат не зависит от состава отдела).
 * Границы строгие (`>`/`<`) — семантика прежней единой выборки.
 */
export const buildAirtimeFilter = (
    userIds: readonly number[] | undefined,
    fromExclusive: string,
    toExclusive: string,
): VoximplantAirtimeFilter => ({
    ...(userIds ? { PORTAL_USER_ID: userIds.map(String) } : {}),
    '>CALL_START_DATE': fromExclusive,
    '<CALL_START_DATE': toExclusive,
    '>CALL_DURATION': 0,
});

/** Пагинированная выгрузка строк статистики (Битрикс отдаёт по 50 строк). */
export async function fetchAirtimeRows(
    bitrixApi: BitrixBaseApi,
    filter: VoximplantAirtimeFilter,
    maxRows: number,
    logger: Logger,
): Promise<AirtimeFetchResult> {
    const rows: VoximplantAirtimeRow[] = [];
    let start = 0;
    let complete = false;

    while (!complete && rows.length < maxRows) {
        const response = (await bitrixApi.call(VOXIMPLANT_STATISTIC_METHOD, {
            FILTER: filter,
            SORT: 'CALL_START_DATE',
            ORDER: 'ASC',
            start,
        })) as VoximplantStatisticEnvelope | null | undefined;

        // Легитимный пустой ответ — это { result: [] }; конверт без result —
        // потерянная страница (дроп лимитера), тихо продолжать нельзя.
        if (
            !response ||
            typeof response !== 'object' ||
            !('result' in response)
        ) {
            throw new AirtimePageDroppedError(start);
        }

        const page = response.result ?? [];
        rows.push(...page);

        if (!page.length || response.next === undefined) {
            complete = true;
        } else {
            start = response.next;
        }
    }

    // Диагностика направлений: гистограмма CALL_TYPE в ответе Bitrix.
    // Если входящие (CALL_TYPE 2/3) в отчёте всегда нули — по логу видно,
    // приходят ли они вообще из voximplant.statistic.get.
    logger.log(
        `${VOXIMPLANT_STATISTIC_METHOD}: собрано ${rows.length} строк` +
            (complete ? '' : ` — обрезано по лимиту ${maxRows}`) +
            ` · CALL_TYPE=${JSON.stringify(callTypeHistogram(rows))}`,
    );
    return { rows, truncated: !complete };
}

/** Гистограмма значений CALL_TYPE (для диагностики входящих/исходящих). */
export function callTypeHistogram(
    rows: readonly VoximplantAirtimeRow[],
): Record<string, number> {
    const histogram: Record<string, number> = {};
    for (const row of rows) {
        const key =
            row.CALL_TYPE === undefined ? 'undefined' : String(row.CALL_TYPE);
        histogram[key] = (histogram[key] ?? 0) + 1;
    }
    return histogram;
}
