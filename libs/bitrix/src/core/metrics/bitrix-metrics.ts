import { Counter, Histogram, register } from 'prom-client';
import { BitrixCallClass } from '../context/bitrix-call-context';

/**
 * Метрики обращений в Битрикс (разбор нагрузки 05.10.2026).
 *
 * До них фон был невидим: успешный одиночный вызов не оставлял в логах ни
 * строки, ожидание в ограничителе писалось только на уровне debug. Вопрос
 * «кто съел лимит портала» решался чтением кода. Теперь по каждому вызову
 * известно: портал, метод, класс (менеджер или фон), исход, длительность и
 * сколько он простоял в очереди ограничителя.
 *
 * Метрики кладутся в реестр prom-client по умолчанию — тот же, что отдаёт
 * `/api/metrics` (@lib/metrics), отдельная регистрация в модулях не нужна.
 * Ядро Bitrix создаётся на каждый вызов и в DI не участвует, поэтому здесь
 * обычные функции, а не провайдеры.
 */
export const BITRIX_REQUESTS_TOTAL = 'bitrix_requests_total';
export const BITRIX_REQUEST_DURATION_SECONDS =
    'bitrix_request_duration_seconds';
export const BITRIX_RATE_LIMIT_WAIT_SECONDS = 'bitrix_rate_limit_wait_seconds';

/** Исход обращения в Битрикс. */
export const BITRIX_REQUEST_RESULT = {
    ok: 'ok',
    error: 'error',
    timeout: 'timeout',
} as const;

export type BitrixRequestResult =
    (typeof BITRIX_REQUEST_RESULT)[keyof typeof BITRIX_REQUEST_RESULT];

/** Чем закончилось ожидание слота в ограничителе. */
export const RATE_LIMIT_OUTCOME = {
    /** Слот выдан. */
    granted: 'granted',
    /** Слот не дождались, запрос ушёл без него (только интерактив). */
    passed: 'passed',
    /** Слот не дождались, вызывающему отказано (фон). */
    rejected: 'rejected',
} as const;

export type RateLimitOutcome =
    (typeof RATE_LIMIT_OUTCOME)[keyof typeof RATE_LIMIT_OUTCOME];

/**
 * Реестр общий на процесс, а модуль в тестах и при горячей перезагрузке
 * загружается повторно — второй `new Counter` с тем же именем бросил бы
 * исключение. Берём уже зарегистрированную метрику, если она есть.
 */
const getOrCreate = <T>(name: string, create: () => T): T =>
    (register.getSingleMetric(name) as T | undefined) ?? create();

const requestsTotal = getOrCreate(
    BITRIX_REQUESTS_TOTAL,
    () =>
        new Counter({
            name: BITRIX_REQUESTS_TOTAL,
            help: 'Обращения в Битрикс: портал, метод, класс вызова, исход',
            labelNames: ['domain', 'method', 'call_class', 'result'],
        }),
);

const requestDuration = getOrCreate(
    BITRIX_REQUEST_DURATION_SECONDS,
    () =>
        new Histogram({
            name: BITRIX_REQUEST_DURATION_SECONDS,
            help: 'Длительность одного обращения в Битрикс, секунды',
            labelNames: ['domain', 'call_class', 'result'],
            buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
        }),
);

const rateLimitWait = getOrCreate(
    BITRIX_RATE_LIMIT_WAIT_SECONDS,
    () =>
        new Histogram({
            name: BITRIX_RATE_LIMIT_WAIT_SECONDS,
            help: 'Ожидание слота в ограничителе запросов Битрикса, секунды',
            labelNames: ['domain', 'call_class', 'outcome'],
            buckets: [0.05, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 300, 600],
        }),
);

export interface BitrixRequestObservation {
    domain: string;
    method: string;
    callClass: BitrixCallClass;
    result: BitrixRequestResult;
    durationMs: number;
}

/** Учесть одно обращение. Сбой метрик не должен ломать запрос в Битрикс. */
export const observeBitrixRequest = ({
    domain,
    method,
    callClass,
    result,
    durationMs,
}: BitrixRequestObservation): void => {
    try {
        requestsTotal.inc({ domain, method, call_class: callClass, result });
        requestDuration.observe(
            { domain, call_class: callClass, result },
            durationMs / 1000,
        );
    } catch {
        // Метрики — подсобное: молчим.
    }
};

export interface RateLimitWaitObservation {
    domain: string;
    callClass: BitrixCallClass;
    outcome: RateLimitOutcome;
    waitedMs: number;
}

/** Учесть ожидание слота в ограничителе. */
export const observeRateLimitWait = ({
    domain,
    callClass,
    outcome,
    waitedMs,
}: RateLimitWaitObservation): void => {
    try {
        rateLimitWait.observe(
            { domain, call_class: callClass, outcome },
            waitedMs / 1000,
        );
    } catch {
        // Метрики — подсобное: молчим.
    }
};
