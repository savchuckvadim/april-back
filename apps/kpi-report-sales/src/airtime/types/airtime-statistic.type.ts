/**
 * Типы статистики эфирного времени (voximplant.statistic.get).
 *
 * Эфирное время = сумма CALL_DURATION (секунды) всех звонков сотрудника
 * за период. Альтернатива счётным бакетам из calling-statistic.type.ts:
 * здесь выгружаются сами строки звонков и агрегируются в памяти.
 */

/** Направления звонка voximplant (значения CALL_TYPE). */
export const VOX_OUTGOING_CALL_TYPES = [1, 4] as const; // исходящий, callback
export const VOX_INCOMING_CALL_TYPES = [2, 3] as const; // входящий, входящий с перенаправлением

/** Минимальный «пользователь» для агрегации (структурно совпадает с BXUserDto). */
export interface IAirtimeUser {
    ID: string;
    NAME: string;
    LAST_NAME: string;
}

/** Строка ответа voximplant.statistic.get (минимально необходимые поля). */
export interface VoximplantAirtimeRow {
    CALL_ID: string;
    PORTAL_USER_ID?: string | number;
    CALL_DURATION?: string | number;
    CALL_START_DATE?: string;
    CALL_TYPE?: string | number;
}

/** Конверт ответа voximplant.statistic.get (постраничная выдача по 50 строк). */
export interface VoximplantStatisticEnvelope {
    result?: VoximplantAirtimeRow[];
    next?: number;
    total?: number;
}

/** Фильтр voximplant.statistic.get для выборки эфирного времени отдела. */
export type VoximplantAirtimeFilter = {
    PORTAL_USER_ID: string[];
    '>CALL_START_DATE': string;
    '<CALL_START_DATE': string;
    '>CALL_DURATION': number;
};

/** Счётчики одного направления (входящие или исходящие). */
export interface IAirtimeDirectionStat {
    count: number;
    seconds: number;
}

/** Итог по одному сотруднику. */
export interface IAirtimeUserResult {
    user: IAirtimeUser;
    userName: string;
    callsCount: number;
    airtimeSeconds: number;
    incoming: IAirtimeDirectionStat;
    outgoing: IAirtimeDirectionStat;
}

/** Итог по отделу + метаданные выгрузки. */
export interface IAirtimeStatisticResult {
    users: IAirtimeUserResult[];
    rowsFetched: number;
    truncated: boolean;
}

/**
 * Кэш-ячейка «сотрудник × календарный месяц»: только агрегат (~120 байт),
 * сырые строки звонков не хранятся. Из таких ячеек собирается ЛЮБОЙ
 * состав команды и ЛЮБОЙ диапазон прошлых месяцев — ключи не растут
 * комбинаторно от фильтров (в отличие от кэша по составам).
 */
export interface AirtimeMonthCell {
    callsCount: number;
    airtimeSeconds: number;
    incoming: IAirtimeDirectionStat;
    outgoing: IAirtimeDirectionStat;
}
