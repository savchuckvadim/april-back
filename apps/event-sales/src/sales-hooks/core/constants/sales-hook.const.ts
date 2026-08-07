/** Пространство app-cache для операций sales-хуков. */
export const SALES_HOOK_CACHE_APP = 'event-sales-hooks';

/** TTL статуса операции: час — хватает и на поллинг фрейма, и на разбор. */
export const SALES_HOOK_STATUS_TTL_SECONDS = 60 * 60;

/** TTL alias-ключа схлопывания двойного клика без operationId. */
export const SALES_HOOK_ALIAS_TTL_SECONDS = 120;

/** TTL маркера «этот элемент уже принят» (повтор робота вне окна тишины). */
export const SALES_HOOK_DEDUPE_TTL_SECONDS = 300;

/** TTL Redis-замка взаимного исключения (кнопка × робот по одной сущности). */
export const SALES_HOOK_LOCK_TTL_MS = 120_000;

/**
 * WS-события — одна пара на всю семью хуков; payload = SalesHookOperationDto,
 * фронт различает хуки по полю `hook`.
 */
export const SALES_HOOK_WS_EVENTS = {
    DONE: 'sales-hook:done',
    ERROR: 'sales-hook:error',
} as const;

/** Код ошибки операции, когда та же сущность уже обрабатывается. */
export const SALES_HOOK_DUPLICATE_IN_PROGRESS = 'duplicate_in_progress';
