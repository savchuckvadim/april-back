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
    /** Минимальная длительность звонка в секундах. */
    minDurationSec: number;
    /** Максимум собираемых строк (защита от разноса пагинации). */
    maxRows?: number;
}

const DEFAULT_MAX_ROWS = 500;

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
    ): Promise<VoximplantCallRow[]> {
        const maxRows = params.maxRows ?? DEFAULT_MAX_ROWS;
        const rows: VoximplantCallRow[] = [];
        let start: number | undefined = 0;

        while (start !== undefined && rows.length < maxRows) {
            const response = (await this.bitrix.api.call(
                'voximplant.statistic.get',
                {
                    FILTER: {
                        '>CALL_DURATION': params.minDurationSec,
                        '>CALL_START_DATE': params.sinceIso,
                    },
                    SORT: 'CALL_START_DATE',
                    ORDER: 'ASC',
                    start,
                },
            )) as VoximplantStatisticResponse;

            const page = response.result ?? [];
            rows.push(...page);

            if (!page.length || response.next === undefined) break;
            start = response.next;
        }

        this.logger.log(
            `voximplant.statistic.get: собрано ${rows.length} звонков (с ${params.sinceIso}, >${params.minDurationSec}с)`,
        );
        return rows.slice(0, maxRows);
    }
}
