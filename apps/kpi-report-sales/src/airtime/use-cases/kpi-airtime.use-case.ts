import { Logger } from '@nestjs/common';
import { BitrixBaseApi } from '@lib/bitrix';
import { GetAirtimeStatisticDto } from '../dto/airtime-statistic.dto';
import {
    IAirtimeStatisticResult,
    IAirtimeUser,
    IAirtimeUserResult,
    VOX_INCOMING_CALL_TYPES,
    VOX_OUTGOING_CALL_TYPES,
    VoximplantAirtimeFilter,
    VoximplantAirtimeRow,
    VoximplantStatisticEnvelope,
} from '../types/airtime-statistic.type';

const VOXIMPLANT_STATISTIC_METHOD = 'voximplant.statistic.get';
const DEFAULT_MAX_ROWS = 10_000;

/**
 * Эфирное время менеджеров: сумма CALL_DURATION по каждому сотруднику
 * за период через voximplant.statistic.get.
 *
 * Альтернатива CallingStatisticUseCase: вместо счётчиков по бакетам
 * длительности (result_total) выгружает сами строки звонков одним
 * пагинированным запросом на весь отдел и агрегирует в памяти —
 * это даёт длительности, которых из count-ответа batch не получить.
 *
 * НЕ Injectable: создаётся `new AirtimeStatisticUseCase(bitrix.api)`
 * под конкретный домен (правило CLAUDE.md про PBXService).
 */
export class AirtimeStatisticUseCase {
    private readonly logger = new Logger(AirtimeStatisticUseCase.name);

    constructor(private readonly bitrixApi: BitrixBaseApi) {}

    async get(dto: GetAirtimeStatisticDto): Promise<IAirtimeStatisticResult> {
        const { departament, dateFrom, dateTo, maxRows } = dto.filters;
        const userIds = departament
            .map(user => String(user.ID ?? '').trim())
            .filter(id => id.length > 0);

        if (!userIds.length) {
            return { users: [], rowsFetched: 0, truncated: false };
        }

        const filter: VoximplantAirtimeFilter = {
            PORTAL_USER_ID: userIds,
            '>CALL_START_DATE': dateFrom,
            '<CALL_START_DATE': dateTo,
            '>CALL_DURATION': 0,
        };

        const { rows, truncated } = await this.fetchRows(
            filter,
            maxRows ?? DEFAULT_MAX_ROWS,
        );

        return {
            users: this.aggregate(rows, departament),
            rowsFetched: rows.length,
            truncated,
        };
    }

    /** Пагинированная выгрузка строк статистики (Битрикс отдаёт по 50 строк). */
    private async fetchRows(
        filter: VoximplantAirtimeFilter,
        maxRows: number,
    ): Promise<{ rows: VoximplantAirtimeRow[]; truncated: boolean }> {
        const rows: VoximplantAirtimeRow[] = [];
        let start = 0;
        let complete = false;

        while (!complete && rows.length < maxRows) {
            const response = (await this.bitrixApi.call(
                VOXIMPLANT_STATISTIC_METHOD,
                {
                    FILTER: filter,
                    SORT: 'CALL_START_DATE',
                    ORDER: 'ASC',
                    start,
                },
            )) as VoximplantStatisticEnvelope;

            const page = response.result ?? [];
            rows.push(...page);

            if (!page.length || response.next === undefined) {
                complete = true;
            } else {
                start = response.next;
            }
        }

        this.logger.log(
            `${VOXIMPLANT_STATISTIC_METHOD}: собрано ${rows.length} строк` +
                (complete ? '' : ` — обрезано по лимиту ${maxRows}`),
        );
        return { rows, truncated: !complete };
    }

    /** Агрегация строк по сотрудникам: счётчики и секунды по направлениям. */
    private aggregate(
        rows: VoximplantAirtimeRow[],
        departament: IAirtimeUser[],
    ): IAirtimeUserResult[] {
        const byUserId = new Map<string, IAirtimeUserResult>();
        for (const user of departament) {
            const id = String(user.ID ?? '').trim();
            if (!id) continue;
            byUserId.set(id, {
                user,
                userName: `${user.NAME} ${user.LAST_NAME}`.trim(),
                callsCount: 0,
                airtimeSeconds: 0,
                incoming: { count: 0, seconds: 0 },
                outgoing: { count: 0, seconds: 0 },
            });
        }

        for (const row of rows) {
            const target = byUserId.get(String(row.PORTAL_USER_ID));
            if (!target) continue;

            const seconds = Number(row.CALL_DURATION) || 0;
            target.callsCount += 1;
            target.airtimeSeconds += seconds;

            const direction = this.resolveDirection(row.CALL_TYPE);
            if (direction) {
                target[direction].count += 1;
                target[direction].seconds += seconds;
            }
        }
        return [...byUserId.values()];
    }

    private resolveDirection(
        callType: VoximplantAirtimeRow['CALL_TYPE'],
    ): 'incoming' | 'outgoing' | null {
        const type = Number(callType);
        if ((VOX_INCOMING_CALL_TYPES as readonly number[]).includes(type)) {
            return 'incoming';
        }
        if ((VOX_OUTGOING_CALL_TYPES as readonly number[]).includes(type)) {
            return 'outgoing';
        }
        return null;
    }
}
