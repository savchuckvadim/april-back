/**
 * Чистые операции над месячными ячейками эфирного времени: агрегация
 * сырых voximplant-строк в ячейки, слияние ячеек разных сегментов и
 * сборка итога по сотрудникам. Вынесены из use-case ради юнит-тестов
 * (никаких зависимостей от Bitrix/кэша).
 */
import {
    AirtimeMonthCell,
    IAirtimeUser,
    IAirtimeUserResult,
    VOX_INCOMING_CALL_TYPES,
    VOX_OUTGOING_CALL_TYPES,
    VoximplantAirtimeRow,
} from '../types/airtime-statistic.type';

export const emptyAirtimeCell = (): AirtimeMonthCell => ({
    callsCount: 0,
    airtimeSeconds: 0,
    incoming: { count: 0, seconds: 0 },
    outgoing: { count: 0, seconds: 0 },
});

const resolveDirection = (
    callType: VoximplantAirtimeRow['CALL_TYPE'],
): 'incoming' | 'outgoing' | null => {
    const type = Number(callType);
    if ((VOX_INCOMING_CALL_TYPES as readonly number[]).includes(type)) {
        return 'incoming';
    }
    if ((VOX_OUTGOING_CALL_TYPES as readonly number[]).includes(type)) {
        return 'outgoing';
    }
    return null;
};

const applyRow = (cell: AirtimeMonthCell, row: VoximplantAirtimeRow): void => {
    const seconds = Number(row.CALL_DURATION) || 0;
    cell.callsCount += 1;
    cell.airtimeSeconds += seconds;
    const direction = resolveDirection(row.CALL_TYPE);
    if (direction) {
        cell[direction].count += 1;
        cell[direction].seconds += seconds;
    }
};

/**
 * Агрегация сырых строк в ячейки по сотрудникам. Для каждого userId из
 * списка создаётся ячейка (нулевая, если звонков нет) — нулевые ячейки
 * обязательны для кэша, иначе «тихие» сотрудники промахиваются вечно.
 */
export const aggregateRowsToCells = (
    rows: readonly VoximplantAirtimeRow[],
    userIds: readonly number[],
): Map<number, AirtimeMonthCell> => {
    const cells = new Map<number, AirtimeMonthCell>(
        userIds.map(userId => [userId, emptyAirtimeCell()]),
    );
    for (const row of rows) {
        const cell = cells.get(Number(row.PORTAL_USER_ID));
        if (cell) applyRow(cell, row);
    }
    return cells;
};

/** День строки статистики: CALL_START_DATE → yyyy-MM-dd (ISO с 'T'). */
const rowDay = (row: VoximplantAirtimeRow): string =>
    String(row.CALL_START_DATE ?? '').slice(0, 10);

/**
 * Агрегация строк в ДНЕВНЫЕ ячейки по (userId, дата). Ключ карты —
 * `${userId}|${yyyy-MM-dd}`. Для каждой пары (сотрудник × день диапазона)
 * создаётся нулевая ячейка — иначе тихие дни промахиваются вечно.
 */
export const aggregateRowsToDayCells = (
    rows: readonly VoximplantAirtimeRow[],
    userIds: readonly number[],
    dates: readonly string[],
): Map<string, AirtimeMonthCell> => {
    const cells = new Map<string, AirtimeMonthCell>();
    for (const userId of userIds) {
        for (const date of dates) {
            cells.set(`${userId}|${date}`, emptyAirtimeCell());
        }
    }
    for (const row of rows) {
        const cell = cells.get(`${Number(row.PORTAL_USER_ID)}|${rowDay(row)}`);
        if (cell) applyRow(cell, row);
    }
    return cells;
};

/** Прибавляет source к acc (мутирует acc). */
export const addCellInto = (
    acc: AirtimeMonthCell,
    cell: AirtimeMonthCell,
): void => {
    acc.callsCount += cell.callsCount;
    acc.airtimeSeconds += cell.airtimeSeconds;
    acc.incoming.count += cell.incoming.count;
    acc.incoming.seconds += cell.incoming.seconds;
    acc.outgoing.count += cell.outgoing.count;
    acc.outgoing.seconds += cell.outgoing.seconds;
};

/** Прибавляет ячейки source к target (мутирует target; новых юзеров добавляет). */
export const mergeCellsInto = (
    target: Map<number, AirtimeMonthCell>,
    source: ReadonlyMap<number, AirtimeMonthCell>,
): void => {
    for (const [userId, cell] of source) {
        const acc = target.get(userId) ?? emptyAirtimeCell();
        addCellInto(acc, cell);
        target.set(userId, acc);
    }
};

/** Итог по сотрудникам в порядке departament (имена — оттуда же). */
export const cellsToUserResults = (
    cells: ReadonlyMap<number, AirtimeMonthCell>,
    departament: readonly IAirtimeUser[],
): IAirtimeUserResult[] =>
    departament
        .filter(user => String(user.ID ?? '').trim().length > 0)
        .map(user => {
            const cell = cells.get(Number(user.ID)) ?? emptyAirtimeCell();
            return {
                user,
                userName: `${user.NAME} ${user.LAST_NAME}`.trim(),
                callsCount: cell.callsCount,
                airtimeSeconds: cell.airtimeSeconds,
                incoming: { ...cell.incoming },
                outgoing: { ...cell.outgoing },
            };
        });
