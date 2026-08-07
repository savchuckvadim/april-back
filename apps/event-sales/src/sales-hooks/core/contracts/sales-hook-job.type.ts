import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';

/** Источник запуска операции. */
export enum EnumSalesHookSource {
    /** Вебхук робота Битрикс (после окна тишины event-silent). */
    ROBOT = 'robot',
    /** Кнопка во фрейме (без silence, с operationId и WS). */
    FRAME = 'frame',
}

/**
 * Конверт элемента, который вебхук-контроллер кладёт в silence-буфер.
 * entityKey нужен подписчику silence для дедупа/замка — сами данные хука
 * для каркаса непрозрачны.
 */
export interface SalesHookRobotEnvelope<TItem = unknown> {
    /** Стабильный ключ сущности, например `lead:42`. */
    entityKey: string;
    data: TItem;
}

/**
 * Полезная нагрузка джобы в EVENT_SALES_HOOK_OPS.
 * Кнопка кладёт один элемент, робот — пачку после окна тишины.
 */
export interface SalesHookJobData<TItem = unknown> {
    hook: EnumSalesHookCode;
    domain: string;
    operationId: string;
    source: EnumSalesHookSource;
    /** socketId фрейма для WS-уведомления; у робота отсутствует. */
    socketId?: string;
    /** Кто инициировал (bxUserId фрейма); у робота отсутствует. */
    initiatorUserId?: number;
    items: TItem[];
}
