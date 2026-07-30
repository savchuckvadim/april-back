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

/**
 * Фильтр voximplant.statistic.get для выборки эфирного времени.
 * PORTAL_USER_ID опционален: воркер месячной партиции собирает статистику
 * ПО ВСЕМУ порталу (без фильтра по сотрудникам) — партиция не зависит от
 * состава отдела.
 */
export type VoximplantAirtimeFilter = {
    PORTAL_USER_ID?: string[];
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

/**
 * Маркер месячной партиции: «месяц собран по ВСЕМУ порталу».
 * Отсутствующая ячейка сотрудника при живом маркере = достоверный ноль
 * (сотрудник в этом месяце не звонил) — нулевые ячейки в портал-wide
 * сборе не пишутся, полный список юзеров портала воркеру неизвестен.
 */
export interface AirtimeMonthMarker {
    /** Выгрузка месяца остановлена по лимиту строк — данные неполные. */
    truncated: boolean;
    /** Сколько строк статистики выгружено при сборе партиции (весь портал). */
    rowsFetched: number;
    /** Когда партиция собрана (ISO). */
    completedAt: string;
}

/** Маркер собранного дня (портал-wide, для хвоста текущего/краевого месяца). */
export interface AirtimeDayMarker {
    truncated: boolean;
    rowsFetched: number;
}

/**
 * Error-маркер месяца: job партиции окончательно упал. Пока маркер жив
 * (короткий TTL), поллинг получает status 'error', а диспетчер не
 * пере-ставит job (защита от crash-loop). Ready-маркеры НЕ перетирает —
 * живёт под отдельным ключом.
 */
export interface AirtimeErrorMarker {
    message: string;
    failedAt: string;
}

/**
 * Живой хвост «сегодня»: агрегат по всем звонившим сегодня сотрудникам
 * портала одной записью с коротким TTL (данные дня ещё меняются).
 */
export interface AirtimeTodayBlob {
    date: string;
    /** userId → ячейка; не звонившие сегодня отсутствуют (= ноль). */
    cells: Record<string, AirtimeMonthCell>;
    rowsFetched: number;
    truncated: boolean;
    computedAt: string;
}

/** Скользящая статистика длительности сбора партиций домена (для ETA). */
export interface AirtimeDurationStats {
    avgMs: number;
    samples: number;
}

/** Готовность одного месяца периода (для прогресса в ответе и WS). */
export interface IAirtimeMonthProgress {
    month: string;
    status: 'ready' | 'queued' | 'error';
}

/** Прогресс сборки периода: «готово N из M месяцев». */
export interface IAirtimeProgress {
    totalMonths: number;
    readyMonths: number;
    months: IAirtimeMonthProgress[];
    /**
     * Приблизительная оценка остатка сбора в секундах (по скользящему
     * среднему длительности партиций домена; очередь других порталов
     * не учитывается).
     */
    etaSeconds?: number;
}

/** Payload WS-события airtime:progress (адресно на socketId запросившего). */
export interface AirtimeProgressEventPayload extends IAirtimeProgress {
    requestKey: string;
    /** Месяц, партиция которого только что собрана. */
    month: string;
}

/** Payload WS-события airtime:done — фронт перезапрашивает POST (кэш готов). */
export interface AirtimeDoneEventPayload {
    requestKey: string;
}

/** Payload WS-события airtime:error. */
export interface AirtimeErrorEventPayload {
    requestKey: string;
    month: string;
    message: string;
}
