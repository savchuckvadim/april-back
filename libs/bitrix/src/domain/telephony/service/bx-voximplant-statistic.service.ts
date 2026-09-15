import { Logger } from '@nestjs/common';
import type { BitrixService } from '../../../bitrix.service';
import {
    BX_VOX_INCOMING_CALL_TYPES,
    BX_VOX_SUCCESS_FAILED_CODE,
    BxVoximplantStatisticParams,
    BxVoximplantStatisticResult,
    BxVoximplantStatisticRow,
} from '../type/bx-voximplant-statistic.type';

/** Ответ `voximplant.statistic.get` в форме конверта пагинации. */
interface BxVoximplantStatisticResponse {
    result?: BxVoximplantStatisticRow[];
    next?: number;
    total?: number;
}

/** Потолок строк за один проход — держит время и память в узде. */
const DEFAULT_MAX_ROWS = 5000;

/**
 * Статистика телефонии портала (`voximplant.statistic.get`, scope
 * telephony). Метод не типизирован в схеме библиотеки, поэтому идёт
 * сырой строкой через `bitrix.api.call` — состав полей и семантика
 * `CALL_FAILED_CODE = "200"` подтверждены по документации REST
 * (b24-dev-mcp, 14.09.2026).
 *
 * НЕ `@Injectable`: создаётся под конкретный домен —
 * `new BxVoximplantStatisticService(bitrix)` (правило про race condition
 * инстанса битрикса).
 */
export class BxVoximplantStatisticService {
    private readonly logger = new Logger(BxVoximplantStatisticService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /** Звонки портала за период постранично (SORT CALL_START_DATE ASC). */
    async getStatistic(
        params: BxVoximplantStatisticParams,
    ): Promise<BxVoximplantStatisticResult> {
        const maxRows = params.maxRows ?? DEFAULT_MAX_ROWS;
        const rows: BxVoximplantStatisticRow[] = [];
        let start: number | undefined = 0;
        let truncated = false;
        let total: number | null = null;

        while (start !== undefined && rows.length < maxRows) {
            const response = (await this.bitrix.api.call(
                'voximplant.statistic.get',
                {
                    FILTER: buildStatisticFilter(params),
                    SORT: 'CALL_START_DATE',
                    ORDER: 'ASC',
                    start,
                },
            )) as BxVoximplantStatisticResponse | null;

            // Битрикс под нагрузкой возвращает конверт без result (дроп
            // страницы). Трактовать это как «данных больше нет» нельзя —
            // потеря выглядела бы как пустой хвост периода.
            if (!response || !('result' in response)) {
                truncated = true;
                this.logger.error(
                    `voximplant.statistic.get: страница со смещения ${start} ` +
                        `не вернула result — выборка неполная`,
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
        return { rows: rows.slice(0, maxRows), truncated, total };
    }
}

/**
 * Фильтр запроса: границы периода включительно (`>=` / `<=`),
 * длительность включительно, сотрудники массивом (Битрикс трактует
 * массив как IN).
 */
export function buildStatisticFilter(
    params: BxVoximplantStatisticParams,
): Record<string, unknown> {
    const filter: Record<string, unknown> = {
        '>=CALL_START_DATE': params.fromIso,
        '<=CALL_START_DATE': params.toIso,
    };
    if (params.minDurationSec !== undefined && params.minDurationSec > 0) {
        filter['>=CALL_DURATION'] = params.minDurationSec;
    }
    if (params.userIds?.length) {
        filter.PORTAL_USER_ID = params.userIds.map(String);
    }
    return filter;
}

/** Длительность разговора в секундах (строка Битрикса → число); 0 — нет. */
export function voxCallDurationSec(row: BxVoximplantStatisticRow): number {
    const value = Number(row.CALL_DURATION ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Тип звонка числом; 0 — Битрикс не отдал тип. */
export function voxCallType(row: BxVoximplantStatisticRow): number {
    const value = Number(row.CALL_TYPE ?? 0);
    return Number.isFinite(value) ? value : 0;
}

/** Входящий ли звонок (входящий или входящий с перенаправлением). */
export function isVoxIncoming(row: BxVoximplantStatisticRow): boolean {
    return (BX_VOX_INCOMING_CALL_TYPES as readonly number[]).includes(
        voxCallType(row),
    );
}

/**
 * Состоялся ли разговор: код `200` И длительность не ниже порога.
 * Порог по умолчанию — 30 с (документ стиля, ось «повторные касания»:
 * короче 30 с это не разговор, а снятая и брошенная трубка).
 */
export function isVoxConversation(
    row: BxVoximplantStatisticRow,
    minDurationSec = 30,
): boolean {
    return (
        String(row.CALL_FAILED_CODE ?? '') === BX_VOX_SUCCESS_FAILED_CODE &&
        voxCallDurationSec(row) >= minDurationSec
    );
}

/** Ключ CRM-сущности звонка ('LEAD:42'); null — звонок без привязки. */
export function voxEntityKey(row: BxVoximplantStatisticRow): string | null {
    const type = String(row.CRM_ENTITY_TYPE ?? '').toUpperCase();
    const id = String(row.CRM_ENTITY_ID ?? '');
    return type && id && id !== '0' ? `${type}:${id}` : null;
}
