/**
 * Константы дневного дайджеста ОП: кэш, очередь, WS, реестр типов событий
 * списка sales_kpi. Никаких magic strings в остальном коде модуля
 * (правило pbx-typing); runtime-массивы as const переиспользуются в @IsIn
 * и Swagger enum.
 */

/** Пространство AppCache (инспекция: POST /app-cache/list { app }). */
export const KPI_DIGEST_CACHE_APP = 'kpi-digest' as const;

/** Версия формата ключей — входит в ключ (дешёвая инвалидация). */
export const KPI_DIGEST_CACHE_VERSION = 'v1' as const;

/** Группы записей AppCache (пакетный сброс по группе). */
export const KPI_DIGEST_CACHE_GROUPS = {
    DAY: 'day',
    PLANNED: 'planned',
    CALLS: 'calls',
    PRESENTATIONS: 'presentations',
    RESULT: 'result',
} as const;

// ---------------------------------------------------------------------
// Презентации дня: сделки воронки «ОП Презентации» (sales_presentation)
// и продажи дня — выигранные сделки «ОП Основная» (sales_base).
// ---------------------------------------------------------------------

/** Предохранитель объёма одной выборки сделок. */
export const KPI_DIGEST_DEALS_CAP = 2_000;

/** Сколько последних строк истории сделки (op_mhistory) отдавать в тултип. */
export const KPI_DIGEST_HISTORY_LINES = 3;

/** Суффиксы STAGE_ID воронки «ОП Презентации» → код стадии реестра. */
export const KPI_DIGEST_PRES_STAGE_BY_SUFFIX: Readonly<Record<string, string>> = {
    NEW: 'spres_new',
    PLAN: 'spres_plan',
    PENDING: 'spres_pending',
    WON: 'spres_success',
    LOSE: 'spres_fail',
    APOLOGY: 'spres_noresult',
};

/**
 * Статус презентации в выбранном дне:
 *  - held — проведена в этот день;
 *  - notHeld — не состоялась;
 *  - refused — отказ после презентации;
 *  - postponed — перенесена;
 *  - pending — стояла на день, ещё не отработана;
 *  - plannedNext — запланирована в этот день на будущее;
 *  - other — попала в выборку иначе (изменение сделки без смены статуса).
 */
export const KPI_DIGEST_PRES_DAY_STATUSES = [
    'held',
    'notHeld',
    'refused',
    'postponed',
    'pending',
    'plannedNext',
    'other',
] as const;
export type KpiDigestPresDayStatus = (typeof KPI_DIGEST_PRES_DAY_STATUSES)[number];

/** Откуда взят комплект/сумма презентации. */
export const KPI_DIGEST_COMPLECT_SOURCES = ['presentation', 'base'] as const;
export type KpiDigestComplectSource = (typeof KPI_DIGEST_COMPLECT_SOURCES)[number];

/** Маркер названия спонтанной презентации (event-sales). */
export const KPI_DIGEST_SPONTANEOUS_TITLE_MARK = 'незапланированн';

/**
 * Закрытый день (раньше сегодняшнего по серверному времени) живёт долго,
 * но не вечно: финалы (продажа/отказ) upsert'ятся и могут сменить дату.
 */
export const KPI_DIGEST_CLOSED_DAY_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Сегодняшний (и будущий) день — короткий буфер: данные ещё пишутся. */
export const KPI_DIGEST_OPEN_DAY_TTL_SECONDS = 120;

/** TTL ready-конверта — транспортный буфер доставки очереди (как у отчёта). */
export const KPI_DIGEST_RESULT_TTL_SECONDS = 180;

/** TTL error-конверта: ломает вечный queued у поллинга. */
export const KPI_DIGEST_RESULT_ERROR_TTL_SECONDS = 120;

/** События WS на socketId клиента. */
export const KPI_DIGEST_WS_EVENTS = {
    DONE: 'kpi-report:digest:done',
    ERROR: 'kpi-report:digest:error',
} as const;

/** Статусы ответа очереди (тот же конверт, что у kpi-report/get). */
export const KPI_DIGEST_RESPONSE_STATUSES = ['ready', 'queued', 'error'] as const;
export type KpiDigestResponseStatus =
    (typeof KPI_DIGEST_RESPONSE_STATUSES)[number];

/**
 * Виды периода дайджеста. Сейчас реализован только день; неделя/месяц/
 * квартал/год — задел (front/docs/kpi-sales-digest.tasks.md).
 */
export const KPI_DIGEST_PERIOD_KINDS = ['day'] as const;
export type KpiDigestPeriodKind = (typeof KPI_DIGEST_PERIOD_KINDS)[number];

/** Ретраи job'ов: backoff больше окна восстановления лимитера. */
export const KPI_DIGEST_JOB_ATTEMPTS = 2;
export const KPI_DIGEST_JOB_BACKOFF_DELAY_MS = 30_000;

/** Страница lists.element.get — Битрикс отдаёт по 50 элементов. */
export const KPI_DIGEST_LIST_PAGE_SIZE = 50;

/**
 * Предохранители объёма одной партиции: день на портале — сотни
 * элементов; превышение означает кривой фильтр или аномальный портал.
 * При превышении партиция помечается truncated, а не молча режется.
 */
export const KPI_DIGEST_ELEMENTS_CAP = 20_000;
export const KPI_DIGEST_CALL_ROWS_CAP = 20_000;

/** Комментарий менеджера в записи дайджеста обрезается (как у LLM-читателя). */
export const KPI_DIGEST_COMMENT_LIMIT = 400;

/** Бакеты длительности звонка, секунд (зеркало CALLING_TYPES calling-statistic). */
export const KPI_DIGEST_CALL_DURATION_BUCKETS = [30, 60, 180, 300, 600] as const;
/** Ключ бакета «все наборы номера» в byDuration. */
export const KPI_DIGEST_CALL_BUCKET_ALL = 'all' as const;

/** Часы суток для почасовых корзин звонков. */
export const KPI_DIGEST_HOURS_IN_DAY = 24;

// ---------------------------------------------------------------------
// Реестр типов и действий списка sales_kpi (коды item'ов без префикса).
// Имена item'ов берутся с портала; здесь — только классификация.
// ---------------------------------------------------------------------

/** Типы событий, которые в дайджесте считаются звонком (подтипы звонка). */
export const KPI_DIGEST_CALL_TYPE_CODES = [
    'xo',
    'call',
    'call_in_progress',
    'call_in_money',
    'come_call',
    'site',
] as const;

export const KPI_DIGEST_PRESENTATION_TYPE_CODE = 'presentation' as const;

/** Встречи/мероприятия помимо презентации. */
export const KPI_DIGEST_MEETING_TYPE_CODES = ['info', 'seminar'] as const;

/** Документные события (действие act_send). */
export const KPI_DIGEST_DOCUMENT_TYPE_CODES = [
    'ev_offer',
    'ev_offer_pres',
    'ev_invoice',
    'ev_invoice_pres',
    'ev_contract',
    'ev_supply',
] as const;

export const KPI_DIGEST_SUCCESS_TYPE_CODE = 'ev_success' as const;
export const KPI_DIGEST_FAIL_TYPE_CODE = 'ev_fail' as const;

/**
 * Дедуп-клоны уникальных презентаций: в списке они дублируют запись
 * `presentation` (insert-once на компанию/контакт) — в дайджесте не
 * считаются, иначе проведённая презентация удваивается.
 */
export const KPI_DIGEST_EXCLUDED_TYPE_CODES = [
    'presentation_uniq',
    'presentation_contact_uniq',
] as const;

/** Группы типов для каталога и фронта. */
export const KPI_DIGEST_TYPE_GROUPS = [
    'call',
    'presentation',
    'meeting',
    'document',
    'outcome',
    'other',
] as const;
export type KpiDigestTypeGroup = (typeof KPI_DIGEST_TYPE_GROUPS)[number];

/** Действия события активности (звонки/презентации/встречи). */
export const KPI_DIGEST_ACTIONS = {
    PLAN: 'plan',
    POUND: 'pound',
    DONE: 'done',
    NOT_HELD: 'act_noresult_fail',
    EXPIRED: 'expired',
    ACT_SEND: 'act_send',
} as const;

/** Действия, создающие план на будущее (новый план и перенос). */
export const KPI_DIGEST_PLAN_ACTION_CODES = [
    KPI_DIGEST_ACTIONS.PLAN,
    KPI_DIGEST_ACTIONS.POUND,
] as const;

/** Контекст для сообщений об ошибках полноты батча. */
export const KPI_DIGEST_BATCH_CONTEXT = 'дайджест дня' as const;
