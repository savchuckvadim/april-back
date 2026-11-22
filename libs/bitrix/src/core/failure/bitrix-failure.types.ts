import type {
    CallActor,
    CallClass,
    CallEntity,
} from '@/core/call-context/call-context';

/**
 * Запись журнала сбоев Битрикса — `meta` строки лога (ClickHouse app_logs).
 *
 * КОНТРАКТ с читателем журнала (`@lib/logger/query`, bitrix-failures.sql):
 * имена полей ниже читаются из meta по JSON-пути — переименование ломает
 * панель «Сбои записи в Битрикс» в админке.
 */

/** Что именно не выполнилось. */
export const BITRIX_FAILURE_KIND = {
    /** Одиночный вызов: попытки исчерпаны или ошибка не лечится повтором. */
    call: 'call',
    /** Пачка (batch) целиком: чанк не выполнен. */
    batch: 'batch',
    /** Одна команда внутри выполненной пачки (result_error). */
    command: 'command',
} as const;

export type BitrixFailureKind =
    (typeof BITRIX_FAILURE_KIND)[keyof typeof BITRIX_FAILURE_KIND];

/** Сущность запроса: «сделка 123» (id из параметров вызова или команды). */
export interface BitrixFailureEntity {
    label: string;
    id: string;
}

/** Что было в пачке — сводкой, без данных клиентов. */
export interface BitrixFailureCommands {
    total: number;
    /** Сколько из них — запись. */
    writes: number;
    /** «сделка ×3, задача ×1, строка списка ×2». */
    summary: string;
    /** Первые ключи команд (≤ 5, обрезанные). */
    keys: string[];
}

export interface BitrixFailure {
    kind: BitrixFailureKind;
    domain: string;
    method: string;
    /** Пропала ли запись (для пачки — есть ли в ней хоть одна запись). */
    write: boolean;
    entity?: BitrixFailureEntity;
    commands?: BitrixFailureCommands;
    /** HTTP-статус ответа, если он был. */
    status?: number;
    /** Суть ошибки: код, описание; без адреса вебхука и тела запроса. */
    error: string;
}

/** Откуда шёл запрос — снимок контекста вызова на момент сбоя. */
export interface BitrixFailureCallContext {
    source: string;
    callClass: CallClass;
    operation?: string;
    entity?: CallEntity;
    actor?: CallActor;
    /** Приложение процесса; '' — не известно. */
    app: string;
}

export interface BitrixFailureLogMeta {
    bitrixFailure: BitrixFailure;
    callContext: BitrixFailureCallContext;
    /** Портал — на верхнем уровне: его понимает фильтр журналов по порталу. */
    domain: string;
}
