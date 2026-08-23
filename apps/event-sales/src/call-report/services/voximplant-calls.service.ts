import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';

/**
 * Строка ответа voximplant.statistic.get (метод не типизирован в libs/bitrix —
 * локальный минимальный интерфейс; фильтр-образец: apps/kpi-report-sales).
 */
export interface VoximplantCallRow {
    CALL_ID: string;
    PORTAL_USER_ID?: string | number;
    CALL_DURATION?: string | number;
    CALL_START_DATE?: string;
    CRM_ACTIVITY_ID?: string | number;
    CRM_ENTITY_TYPE?: string;
    CRM_ENTITY_ID?: string | number;
}

interface VoximplantStatisticResponse {
    result?: VoximplantCallRow[];
    next?: number;
    total?: number;
}

export interface FindRecentCallsParams {
    /** Нижняя граница CALL_START_DATE (ISO). */
    sinceIso: string;
    /**
     * Минимальная длительность звонка в секундах, ВКЛЮЧИТЕЛЬНО: порог 60
     * означает «60 секунд и длиннее» (оператор `>=`).
     */
    minDurationSec: number;
    /**
     * Bitrix-id сотрудников, чьи звонки нужны. Фильтр уходит В ЗАПРОС
     * Битрикса — это ключ к полноте охвата: без него потолок maxRows
     * применяется ко ВСЕМУ порталу, и звонки нужных сотрудников
     * вытесняются чужими (прод-урок 23.08.2026). Пусто — весь портал.
     */
    userIds?: number[];
    /** Максимум собираемых строк (защита от разноса пагинации). */
    maxRows?: number;
}

/** Итог выборки: строки + честный признак неполноты. */
export interface FindRecentCallsResult {
    rows: VoximplantCallRow[];
    /**
     * Выборка неполная: упёрлись в maxRows либо Битрикс не отдал страницу.
     * ВСЕГДА должен приводить к алерту у вызывающего — молчаливая обрезка
     * означает потерянные звонки.
     */
    truncated: boolean;
    /** Сколько строк всего по фильтру (из ответа Битрикса); null — не отдал. */
    total: number | null;
}

/**
 * Потолок строк за один проход. Держит время скана и память в узде;
 * при заданном userIds выборка и так узкая, потолок для неё недостижим.
 */
const DEFAULT_MAX_ROWS = 2000;

/**
 * Поиск свежих звонков портала через voximplant.statistic.get.
 *
 * НЕ Injectable: создаётся через `new VoximplantCallsService(bitrix)`
 * под конкретный домен (правило CLAUDE.md). Метод дергается сырой
 * строкой через api.call (в библиотеке voximplant не типизирован).
 */
export class VoximplantCallsService {
    private readonly logger = new Logger(VoximplantCallsService.name);

    constructor(private readonly bitrix: BitrixService) {}

    async findRecentCalls(
        params: FindRecentCallsParams,
    ): Promise<FindRecentCallsResult> {
        const maxRows = params.maxRows ?? DEFAULT_MAX_ROWS;
        const rows: VoximplantCallRow[] = [];
        let start: number | undefined = 0;
        let truncated = false;
        let total: number | null = null;

        while (start !== undefined && rows.length < maxRows) {
            const response = (await this.bitrix.api.call(
                'voximplant.statistic.get',
                {
                    FILTER: this.buildFilter(params),
                    SORT: 'CALL_START_DATE',
                    ORDER: 'ASC',
                    start,
                },
            )) as VoximplantStatisticResponse;

            // Битрикс под нагрузкой может вернуть конверт без result
            // (дроп страницы). Раньше это молча трактовалось как «данных
            // больше нет» — то есть потеря выглядела как пустой хвост.
            if (!response || !('result' in response)) {
                truncated = true;
                this.logger.error(
                    `voximplant.statistic.get: страница со смещения ${start} не вернула result — ` +
                        `выборка неполная, часть звонков не увидена`,
                    { telegram: true },
                );
                break;
            }

            const page = response.result ?? [];
            if (typeof response.total === 'number') total = response.total;
            rows.push(...page);

            if (!page.length || response.next === undefined) break;
            start = response.next;
        }

        if (rows.length >= maxRows) truncated = true;
        const collected = rows.slice(0, maxRows);

        const scope = params.userIds?.length
            ? `сотрудники [${params.userIds.join(', ')}]`
            : 'весь портал';
        this.logger.log(
            `voximplant.statistic.get: собрано ${collected.length} звонков ` +
                `(с ${params.sinceIso}, от ${params.minDurationSec}с, ${scope}` +
                `${total !== null ? `, всего по фильтру ${total}` : ''})`,
        );
        if (truncated) {
            this.logger.error(
                `Выборка звонков ОБРЕЗАНА (${collected.length} строк, лимит ${maxRows}` +
                    `${total !== null ? `, всего по фильтру ${total}` : ''}) — ` +
                    `часть звонков не попадёт в обработку: сузьте окно, задайте список ` +
                    `сотрудников или поднимите лимит строк`,
                { telegram: true },
            );
        }

        return { rows: collected, truncated, total };
    }

    /**
     * Фильтр запроса. Длительность — ВКЛЮЧИТЕЛЬНО (`>=`): порог 60 означает
     * «от 60 секунд», а не «от 61» (прод-урок 23.08.2026). Сотрудники —
     * массивом (Битрикс трактует массив как IN).
     */
    private buildFilter(
        params: FindRecentCallsParams,
    ): Record<string, unknown> {
        const filter: Record<string, unknown> = {
            '>=CALL_DURATION': params.minDurationSec,
            '>CALL_START_DATE': params.sinceIso,
        };
        if (params.userIds?.length) {
            filter.PORTAL_USER_ID = params.userIds.map(String);
        }
        return filter;
    }
}
