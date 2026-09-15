/**
 * Строка статистики телефонии Bitrix24 (`voximplant.statistic.get`).
 *
 * Состав полей — по официальной документации REST (b24-dev-mcp,
 * `voximplant.statistic.get`, проверено 14.09.2026): значения приходят
 * СТРОКАМИ (`CALL_DURATION: "95"`, `CALL_TYPE: "1"`), поэтому тип
 * допускает и строку, и число, а приведение делает читатель.
 *
 * `CALL_FAILED_CODE = "200"` — разговор состоялся; любое другое значение
 * («603-S», «486» и т.п.) означает, что разговора не было.
 */
export interface BxVoximplantStatisticRow {
    ID?: string | number;
    CALL_ID?: string;
    /** Bitrix-id сотрудника, за которым записан звонок. */
    PORTAL_USER_ID?: string | number;
    PHONE_NUMBER?: string;
    /** Длительность разговора в секундах; 0 — разговора не было. */
    CALL_DURATION?: string | number;
    /** Начало звонка в ISO с оффсетом портала ('2026-03-10T11:19:38+03:00'). */
    CALL_START_DATE?: string;
    /** Тип звонка: 1 — исходящий, 2 — входящий, 3 — входящий с перенаправлением, 4 — обратный. */
    CALL_TYPE?: string | number;
    /** '200' — разговор состоялся; иначе код неуспеха SIP. */
    CALL_FAILED_CODE?: string | number;
    CALL_FAILED_REASON?: string;
    /** LEAD | DEAL | CONTACT | COMPANY; пусто — звонок без привязки к CRM. */
    CRM_ENTITY_TYPE?: string;
    CRM_ENTITY_ID?: string | number;
    CRM_ACTIVITY_ID?: string | number;
    /** Номер повторной попытки автодозвона; null — обычный звонок. */
    REDIAL_ATTEMPT?: string | number | null;
    COST?: string | number;
}

/** Код типа звонка телефонии (числом, как в CALL_TYPE после приведения). */
export const BX_VOX_CALL_TYPES = {
    outgoing: 1,
    incoming: 2,
    incomingRedirect: 3,
    callback: 4,
} as const;

export type BxVoxCallType =
    (typeof BX_VOX_CALL_TYPES)[keyof typeof BX_VOX_CALL_TYPES];

/** Входящие типы звонка (входящий и входящий с перенаправлением). */
export const BX_VOX_INCOMING_CALL_TYPES: readonly BxVoxCallType[] = [
    BX_VOX_CALL_TYPES.incoming,
    BX_VOX_CALL_TYPES.incomingRedirect,
];

/** Код `CALL_FAILED_CODE` состоявшегося разговора. */
export const BX_VOX_SUCCESS_FAILED_CODE = '200' as const;

/** Параметры выборки статистики за период. */
export interface BxVoximplantStatisticParams {
    /** Нижняя граница CALL_START_DATE, ВКЛЮЧИТЕЛЬНО (ISO с оффсетом). */
    fromIso: string;
    /** Верхняя граница CALL_START_DATE, ВКЛЮЧИТЕЛЬНО (ISO с оффсетом). */
    toIso: string;
    /**
     * Bitrix-id сотрудников. Фильтр уходит В ЗАПРОС Битрикса: без него
     * потолок строк применяется ко всему порталу и звонки нужных
     * сотрудников вытесняются чужими. Пусто — весь портал.
     */
    userIds?: readonly (string | number)[];
    /** Минимальная длительность в секундах, ВКЛЮЧИТЕЛЬНО; 0 — все наборы. */
    minDurationSec?: number;
    /** Потолок собираемых строк (защита от разноса пагинации). */
    maxRows?: number;
}

/** Итог выборки: строки и честный признак неполноты. */
export interface BxVoximplantStatisticResult {
    rows: BxVoximplantStatisticRow[];
    /**
     * Выборка неполная: упёрлись в maxRows либо Битрикс не отдал страницу.
     * Молчаливая обрезка означает потерянные звонки — вызывающий обязан
     * либо сузить окно, либо поднять алерт.
     */
    truncated: boolean;
    /** Всего строк по фильтру из ответа Битрикса; null — не отдал. */
    total: number | null;
}
