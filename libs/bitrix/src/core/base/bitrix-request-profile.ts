import * as http from 'http';
import * as https from 'https';
import {
    BITRIX_CALL_CLASS,
    BitrixCallClass,
} from '../context/bitrix-call-context';

/**
 * Сроки и повторы одного обращения в Битрикс — по классу вызова.
 *
 * До 05.10.2026 профиль был один на всех: 300 с на попытку и две повторные
 * с паузой 30 с — до 16 минут на один вызов. Для ночного обхода это
 * терпимо, а менеджер, открывший карточку, всё это время смотрел на
 * скелетон, хотя nginx рвал его запрос уже через 5 минут и обработчик
 * дальше ходил в Битрикс впустую.
 *
 * Интерактиву — короткий таймаут и одна быстрая повторная попытка: лучше
 * быстро показать «не получилось, повторите», чем держать соединение. Фону
 * оставлены прежние длинные сроки: тяжёлые пачки отчётов в 30 секунд не
 * укладываются, а торопиться им некуда.
 */
export interface BitrixRequestProfile {
    /** Таймаут одной попытки, мс. */
    timeoutMs: number;
    /** Сколько повторных попыток после первой. */
    retries: number;
    /** Пауза перед повтором после таймаута, мс. */
    timeoutPauseMs: number;
    /** Пауза перед повтором, когда Битрикс ответил «занят» (503), мс. */
    busyPauseMs: number;
    /** Пауза перед повтором при превышении лимита запросов, мс. */
    queryLimitPauseMs: number;
}

export const BITRIX_REQUEST_PROFILES: Record<
    BitrixCallClass,
    BitrixRequestProfile
> = {
    [BITRIX_CALL_CLASS.interactive]: {
        timeoutMs: 30_000,
        retries: 1,
        timeoutPauseMs: 1_000,
        busyPauseMs: 2_000,
        queryLimitPauseMs: 3_000,
    },
    [BITRIX_CALL_CLASS.background]: {
        timeoutMs: 300_000,
        retries: 2,
        timeoutPauseMs: 30_000,
        busyPauseMs: 10_000,
        queryLimitPauseMs: 35_000,
    },
};

/** Обращение длилось дольше — пишем предупреждение с методом и источником. */
export const SLOW_BITRIX_REQUEST_MS = 5_000;

/**
 * Фоновый запрос, на который Битрикс потратил больше этого (`time.processing`),
 * — тяжёлый: после него фон делает паузу той же длины.
 *
 * Зачем (разбор нагрузки 05.10.2026, пункт 3.5): кроме частоты у Битрикса
 * есть лимит времени работы метода — 480 секунд за 10 минут на портал.
 * Ограничитель считает запросы, а не их тяжесть, и обход всей воронки или
 * отчёт по тысячам задач выедал этот лимит у менеджеров. Пауза размером с
 * тяжесть запроса растягивает такую работу во времени сама собой.
 */
export const HEAVY_BACKGROUND_PROCESSING_SEC = 2;

/** Самая длинная пауза после тяжёлого фонового запроса. */
export const MAX_BACKGROUND_COOLDOWN_MS = 10_000;

/** Пауза после фонового запроса; 0 — запрос лёгкий. */
export const backgroundCooldownMs = (processingSec: number | null): number =>
    processingSec !== null && processingSec > HEAVY_BACKGROUND_PROCESSING_SEC
        ? Math.min(Math.round(processingSec * 1000), MAX_BACKGROUND_COOLDOWN_MS)
        : 0;

/**
 * Общий пул соединений с Битриксом — один на процесс.
 *
 * Раньше каждый `pbxService.init` (7–8 на одно открытие сделки) создавал
 * свои агенты: соединения между экземплярами не переиспользовались, и
 * первый запрос каждого экземпляра начинался с нового TLS-рукопожатия.
 * Агент — это только пул сокетов; сам экземпляр Bitrix по-прежнему
 * создаётся на каждый вызов и ни с кем не делится (правило проекта).
 *
 * maxSockets ограничивает число одновременных соединений с одним порталом:
 * больше лимит Битрикса всё равно не пропустит, а без предела всплеск
 * открыл бы сотни сокетов.
 */
const AGENT_OPTIONS = {
    keepAlive: true,
    maxSockets: 32,
    maxFreeSockets: 8,
} as const;

export const BITRIX_HTTP_AGENT = new http.Agent(AGENT_OPTIONS);
export const BITRIX_HTTPS_AGENT = new https.Agent(AGENT_OPTIONS);
