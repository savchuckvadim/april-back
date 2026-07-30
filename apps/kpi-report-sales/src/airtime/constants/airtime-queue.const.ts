import {
    AIRTIME_DAY_TTL_SECONDS,
    AIRTIME_MONTH_TTL_SECONDS,
} from './airtime.const';

/**
 * Константы очереди эфирного времени (месячные партиции + дневные диапазоны).
 *
 * Ни одной magic string в остальном коде модуля: статусы, режимы, события WS
 * и TTL маркеров объявлены здесь единожды (правило pbx-typing / dto-conventions:
 * runtime-массивы as const переиспользуются в @IsIn и Swagger enum).
 */

/** Версия формата партиций — входит в ключи маркеров и jobId (дешёвая инвалидация). */
export const AIRTIME_PARTITION_VERSION = 1 as const;

/** Статусы ответа POST /kpi-airtime/get в режиме очереди. */
export const AIRTIME_RESPONSE_STATUSES = ['ready', 'queued', 'error'] as const;
export type AirtimeResponseStatus = (typeof AIRTIME_RESPONSE_STATUSES)[number];

/** Статус готовности одного месяца в прогрессе сборки. */
export const AIRTIME_MONTH_STATUSES = ['ready', 'queued', 'error'] as const;
export type AirtimeMonthStatus = (typeof AIRTIME_MONTH_STATUSES)[number];

/**
 * Режим запроса: 'sync' — легаси-поведение (расчёт прямо в HTTP-запросе,
 * как до введения очереди), 'queue' — очередь партиций + WS/поллинг.
 * Отсутствие поля = 'sync': старый прод-фронт продолжает работать без деплоя.
 */
export const AIRTIME_REQUEST_MODES = ['sync', 'queue'] as const;
export type AirtimeRequestMode = (typeof AIRTIME_REQUEST_MODES)[number];

/** События WS для фронта (слушатель airtime-ws.listener в apps/kpi-sales). */
export const AIRTIME_WS_EVENTS = {
    PROGRESS: 'airtime:progress',
    DONE: 'airtime:done',
    ERROR: 'airtime:error',
} as const;

/**
 * Лимит строк воркера на ОДНУ партицию (месяц или дневной диапазон).
 * Отдельный от dto.filters.maxRows (тот действует только в sync-режиме):
 * месячная выборка по всему порталу практически не достигает 50k,
 * лимит — страховка от разноса пагинации.
 */
export const AIRTIME_JOB_MAX_ROWS = 50_000;

/**
 * TTL маркера месячной партиции: чуть меньше TTL месячных ячеек, чтобы
 * состояние «маркер жив, ячейки протухли» было невозможно (иначе тихие нули).
 */
export const AIRTIME_MONTH_MARKER_TTL_SECONDS =
    AIRTIME_MONTH_TTL_SECONDS - 7 * 24 * 3600;

/** TTL дневного маркера: чуть меньше TTL дневных ячеек (та же инварианта). */
export const AIRTIME_DAY_MARKER_TTL_SECONDS =
    AIRTIME_DAY_TTL_SECONDS - 24 * 3600;

/**
 * TTL маркера/блоба «сегодня»: минуты — данные текущего дня ещё меняются,
 * повторный запрос после протухания пересоберёт хвост.
 */
export const AIRTIME_TODAY_TTL_SECONDS = 120;

/**
 * TTL error-маркера месяца: пока он жив, поллинг получает status 'error'
 * (а не вечный queued), а диспетчер НЕ пере-ставит упавший job автоматически
 * (защита от crash-loop). Повтор — по forceRefresh или после протухания.
 */
export const AIRTIME_ERROR_MARKER_TTL_SECONDS = 120;

/**
 * TTL ready-маркера ОБРЕЗАННОЙ (truncated) партиции: 1 час вместо лет.
 * Ретраить бесполезно (лимит строк не уменьшится), навсегда кэшировать
 * неполный месяц нельзя — компромисс: живёт час, отчёт честно помечен
 * truncated, через час пересбор.
 */
export const AIRTIME_TRUNCATED_MARKER_TTL_SECONDS = 3600;

/** Попытки job'а партиции + пауза экспоненциального backoff (мс). */
export const AIRTIME_JOB_ATTEMPTS = 3;
export const AIRTIME_JOB_BACKOFF_DELAY_MS = 15_000;

/**
 * Кап периода запроса в режиме queue: защита прода от «выбрали 10 лет»
 * (сотни месячных прогонов под лимитером Битрикса). Больше — понятная
 * ошибка 400, а не многочасовая очередь.
 */
export const AIRTIME_MAX_MONTHS_PER_REQUEST = 36;

/**
 * Порционная постановка: не больше стольких job'ов за один POST.
 * Следующую порцию ставит очередной поллинг-запрос (поллинг обязателен
 * по контракту фронта) — постановка идемпотентна благодаря jobId-дедупу.
 * Эффект: заброшенный запрос (пользователь закрыл вкладку → поллинг
 * прекратился) затухает сам, дособрав в кэш не более этой порции,
 * вместо того чтобы молотить весь период впустую.
 */
export const AIRTIME_MAX_JOBS_PER_DISPATCH = 6;

/**
 * Приоритеты Bull (меньше = выше): интерактивные запросы пользователей
 * важнее будущего ночного cron-прогрева.
 */
export const AIRTIME_PRIORITY_INTERACTIVE = 5;
export const AIRTIME_PRIORITY_WARMUP = 10;

/** Группы маркеров в AppCache — для инспекции POST /app-cache/list. */
export const AIRTIME_CACHE_GROUP_MARKER = 'marker' as const;
export const AIRTIME_CACHE_GROUP_TODAY = 'today' as const;

/** Виды партиций для статистики длительности сбора (оценка ETA). */
export const AIRTIME_DURATION_KINDS = ['month', 'span'] as const;
export type AirtimeDurationKind = (typeof AIRTIME_DURATION_KINDS)[number];

/**
 * Дефолты ETA (секунды на партицию), пока по домену нет замеров:
 * месяц портал-wide под лимитером ~2 стр/сек — порядка пары минут,
 * дневной хвост — десятки секунд.
 */
export const AIRTIME_ETA_DEFAULT_SECONDS: Record<AirtimeDurationKind, number> =
    {
        month: 120,
        span: 25,
    };

/** Кап выборки скользящего среднего длительности (адаптивность оценки). */
export const AIRTIME_DURATION_MAX_SAMPLES = 20;

/** TTL статистики длительностей сбора по домену. */
export const AIRTIME_DURATION_STATS_TTL_SECONDS = 30 * 24 * 3600;
